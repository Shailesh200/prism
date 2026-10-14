import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPrune, planPrune } from "./data-prune.js";

function write(path: string, body: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

function library() {
  const home = mkdtempSync(join(tmpdir(), "prism-prune-"));
  const live = mkdtempSync(join(tmpdir(), "prism-prune-repo-"));
  const ws = (key: string) => join(home, "workspaces", key);

  // A live checkout: nothing in it may be touched.
  write(
    join(ws("live"), "hooks", "snapshot.json"),
    JSON.stringify({ workspace: live }),
  );
  write(join(ws("live"), "cache", "index.sqlite"), "index");
  write(join(ws("live"), "receipts", "history.jsonl"), "{}\n");
  mkdirSync(join(ws("live"), "dispatch", "worktrees", "tracked"), {
    recursive: true,
  });
  const gitdir = join(live, ".git", "worktrees", "tracked");
  mkdirSync(gitdir, { recursive: true });
  write(
    join(ws("live"), "dispatch", "worktrees", "tracked", ".git"),
    `gitdir: ${gitdir}\n`,
  );
  write(join(ws("live"), "dispatch", "worktrees", "stale", "a.ts"), "x");

  // A checkout that was deleted: its cache goes, its receipts stay.
  write(
    join(ws("gone"), "dispatch", "meta.json"),
    JSON.stringify({ path: join(live, "does-not-exist") }),
  );
  write(join(ws("gone"), "cache", "index.sqlite"), "old index");
  write(join(ws("gone"), "receipts", "history.jsonl"), "{}\n");

  // An empty folder.
  mkdirSync(join(ws("empty"), "dispatch"), { recursive: true });

  // No recorded root: kept.
  write(join(ws("unknown"), "cache", "index.sqlite"), "?");

  write(join(home, "envelope-ledger.jsonl"), "{}\n");
  write(join(home, "prepare-history.json"), "[]");
  return { home, ws };
}

describe("prism data prune", () => {
  it("plans only empty folders, gone checkouts' caches, and untracked worktrees", () => {
    const { home, ws } = library();
    const plan = planPrune(home).map((item) => [item.path, item.reason]);
    expect(plan).toEqual([
      [ws("empty"), "empty workspace folder"],
      [join(ws("gone"), "cache"), "checkout no longer on disk"],
      [
        join(ws("live"), "dispatch", "worktrees", "stale"),
        "worktree git no longer tracks",
      ],
    ]);
  });

  it("removes exactly the plan and keeps the ledger, receipts, history and live index", () => {
    const { home, ws } = library();
    applyPrune(planPrune(home));
    expect(existsSync(ws("empty"))).toBe(false);
    expect(existsSync(join(ws("gone"), "cache"))).toBe(false);
    expect(existsSync(join(ws("gone"), "receipts", "history.jsonl"))).toBe(
      true,
    );
    expect(existsSync(join(ws("live"), "cache", "index.sqlite"))).toBe(true);
    expect(existsSync(join(ws("live"), "hooks", "snapshot.json"))).toBe(true);
    expect(
      existsSync(join(ws("live"), "dispatch", "worktrees", "tracked")),
    ).toBe(true);
    expect(existsSync(join(ws("unknown"), "cache", "index.sqlite"))).toBe(true);
    expect(existsSync(join(home, "envelope-ledger.jsonl"))).toBe(true);
    expect(existsSync(join(home, "prepare-history.json"))).toBe(true);
    expect(planPrune(home)).toEqual([]);
  });
});
