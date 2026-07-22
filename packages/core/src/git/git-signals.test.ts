import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGitLog, readSyncStatus } from "./git-signals.js";

const REC = "\u001e";
const SEP = "\u001f";

function commit(
  sha: string,
  author: string,
  date: string,
  message: string,
  email = `${author.toLowerCase()}@example.com`,
): string {
  return `${REC}${sha}${SEP}${author}${SEP}${email}${SEP}${date}${SEP}${message}`;
}

const NOW = Date.parse("2026-01-15T00:00:00Z");

const LOG = [
  commit("sha1", "Alice", "2026-01-14T10:00:00Z", "fix bug"),
  "10\t2\tsrc/a.ts",
  "5\t0\tsrc/b.ts",
  commit("sha2", "Bob", "2026-01-01T10:00:00Z", "feat: add"),
  "3\t1\tsrc/a.ts",
  commit("sha3", "Alice", "2025-06-01T10:00:00Z", "old"),
  "-\t-\tassets/logo.png",
  "",
].join("\n");

describe("parseGitLog", () => {
  it("aggregates per-file commits, churn, and last commit (newest first)", () => {
    const { signals } = parseGitLog(LOG, { now: NOW });
    const a = signals.get("src/a.ts");
    expect(a).toBeDefined();
    expect(a!.commits).toBe(2);
    expect(a!.additions).toBe(13);
    expect(a!.deletions).toBe(3);
    expect(a!.lastCommit.sha).toBe("sha1");
    expect(a!.lastCommit.email).toBe("alice@example.com");
    // last-commit (sha1) churn for src/a.ts is "10\t2"
    expect(a!.lastAdditions).toBe(10);
    expect(a!.lastDeletions).toBe(2);
    expect(a!.recent).toHaveLength(2);
    // two authors, sorted by commits desc then name
    expect(a!.contributors.map((c) => c.author)).toEqual(["Alice", "Bob"]);
    // changed ~1 day ago within a 180d window -> high recency
    expect(a!.recency).toBeGreaterThan(0.9);
  });

  it("treats binary '-' numstat as zero and still counts the commit", () => {
    const { signals } = parseGitLog(LOG, { now: NOW });
    const png = signals.get("assets/logo.png");
    expect(png).toBeDefined();
    expect(png!.commits).toBe(1);
    expect(png!.additions).toBe(0);
    expect(png!.deletions).toBe(0);
    // ~7.5 months old -> recency floored at 0
    expect(png!.recency).toBe(0);
  });

  it("buckets commits into trailing weeks (newest at the end)", () => {
    const { signals } = parseGitLog(LOG, { now: NOW });
    const a = signals.get("src/a.ts")!;
    expect(a.weeks).toHaveLength(12);
    // sha1 (~0.6d) -> last bucket; sha2 (~13.6d) -> one bucket earlier
    expect(a.weeks[11]).toBe(1);
    expect(a.weeks[10]).toBe(1);
  });

  it("summarizes the repo window", () => {
    const { summary } = parseGitLog(LOG, { now: NOW });
    expect(summary.totalCommits).toBe(3);
    expect(summary.headSha).toBe("sha1");
    expect(summary.lastDate).toBe("2026-01-14T10:00:00Z");
    expect(summary.firstDate).toBe("2025-06-01T10:00:00Z");
  });

  it("builds a repo-wide daily commit histogram (ascending, unfiltered)", () => {
    const { days } = parseGitLog(LOG, { now: NOW });
    expect(days).toEqual([
      { date: "2025-06-01", commits: 1 },
      { date: "2026-01-01", commits: 1 },
      { date: "2026-01-14", commits: 1 },
    ]);
  });

  it("counts each distinct commit once per day even when keepPaths filters", () => {
    // keepPaths only filters per-file signals, not the repo-wide day histogram.
    const { days } = parseGitLog(LOG, {
      now: NOW,
      keepPaths: new Set(["src/a.ts"]),
    });
    expect(days.reduce((n, d) => n + d.commits, 0)).toBe(3);
  });

  it("honors keepPaths filtering", () => {
    const { signals } = parseGitLog(LOG, {
      now: NOW,
      keepPaths: new Set(["src/a.ts"]),
    });
    expect(signals.has("src/a.ts")).toBe(true);
    expect(signals.has("src/b.ts")).toBe(false);
    expect(signals.has("assets/logo.png")).toBe(false);
  });

  it("returns empty signals for non-log input", () => {
    const { signals, summary } = parseGitLog("", { now: NOW });
    expect(signals.size).toBe(0);
    expect(summary.totalCommits).toBe(0);
  });
});

describe("readSyncStatus", () => {
  /** Build a fake `run` that answers by the git subcommand. */
  function fakeRun(
    responses: Record<string, string | null>,
  ): (args: string[]) => string | null {
    return (args) => {
      if (args[0] === "rev-parse" && args.includes("@{u}")) {
        return responses.upstream ?? null;
      }
      if (args[0] === "rev-parse") return responses.gitDir ?? null;
      if (args[0] === "rev-list" && args.includes("--count")) {
        return responses.counts ?? null;
      }
      if (args[0] === "rev-list") return responses.unpushed ?? null;
      return null;
    };
  }

  it("parses ahead/behind and the unpushed SHA set from upstream", () => {
    const { sync, unpushedShas } = readSyncStatus(
      "/repo",
      fakeRun({
        gitDir: "/repo/.git",
        upstream: "origin/main\n",
        counts: "2\t3\n", // 2 behind, 3 ahead
        unpushed: "aaa\nbbb\nccc\n",
      }),
    );
    expect(sync?.upstream).toBe("origin/main");
    expect(sync?.behind).toBe(2);
    expect(sync?.ahead).toBe(3);
    expect([...(unpushedShas ?? [])]).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("returns no sync (and no unpushed set) when there is no upstream", () => {
    const { sync, unpushedShas } = readSyncStatus(
      "/repo",
      fakeRun({ gitDir: "/repo/.git", upstream: null }),
    );
    expect(sync).toBeUndefined();
    expect(unpushedShas).toBeUndefined();
  });

  it("reports lastFetch from FETCH_HEAD mtime", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-git-"));
    writeFileSync(join(dir, "FETCH_HEAD"), "");
    const when = new Date("2026-01-10T08:00:00Z");
    utimesSync(join(dir, "FETCH_HEAD"), when, when);

    const { sync } = readSyncStatus(
      "/ignored",
      fakeRun({ gitDir: dir, upstream: "origin/main\n", counts: "0\t0\n" }),
    );
    expect(sync?.lastFetch).toBe(when.toISOString());
  });
});
