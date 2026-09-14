import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendEnvelopeLedger,
  envelopeLedgerPath,
  readEnvelopeLedger,
  summarizeEnvelopeLedger,
  summarizeJobEnvelope,
  type EnvelopeLedgerEntry,
} from "./envelope-ledger.js";

function entry(
  patch: Partial<EnvelopeLedgerEntry> &
    Pick<EnvelopeLedgerEntry, "ts" | "tool">,
): EnvelopeLedgerEntry {
  return {
    itemCount: 10,
    totalCount: 10,
    truncated: false,
    limit: 50,
    jsonBytes: 100,
    ...patch,
  };
}

describe("summarizeEnvelopeLedger", () => {
  it("is unavailable when the week is empty — never 0%", () => {
    const metrics = summarizeEnvelopeLedger(
      [],
      Date.parse("2026-09-11T00:00:00Z"),
    );
    expect(metrics.available).toBe(false);
    expect(metrics.bytesKeptRatio).toBeNull();
    expect(metrics.listCalls).toBeNull();
    expect(metrics.chatCalls).toBeNull();
    expect(metrics.days).toEqual([]);
    expect(metrics.provenance.bytesKept).toBe("unavailable");
  });

  it("computes a measured bytes-kept ratio from truncated list calls", () => {
    const now = Date.parse("2026-09-11T12:00:00Z");
    const metrics = summarizeEnvelopeLedger(
      [
        entry({
          ts: "2026-09-11T11:00:00.000Z",
          tool: "search_symbols",
          itemCount: 50,
          totalCount: 100,
          truncated: true,
          limit: 50,
          jsonBytes: 100,
        }),
      ],
      now,
    );
    expect(metrics.available).toBe(true);
    expect(metrics.bytesKeptRatio).toBeCloseTo(0.5);
    expect(metrics.truncatedCalls).toBe(1);
    expect(metrics.chatCalls).toBe(1);
    expect(metrics.jobCalls).toBe(0);
    expect(metrics.provenance.bytesKept).toBe("measured");
  });

  it("fills a 7-day cut with this-chat vs teammate split", () => {
    const now = Date.parse("2026-09-11T12:00:00Z");
    const metrics = summarizeEnvelopeLedger(
      [
        entry({
          ts: "2026-09-10T12:00:00.000Z",
          tool: "search_symbols",
          itemCount: 50,
          totalCount: 200,
          truncated: true,
          jsonBytes: 80,
        }),
        entry({
          ts: "2026-09-11T10:00:00.000Z",
          tool: "list_packages",
          itemCount: 40,
          totalCount: 65,
          truncated: true,
          jsonBytes: 120,
        }),
        entry({
          ts: "2026-09-11T11:00:00.000Z",
          tool: "find_symbol",
          jobId: "envelope-cli-sarif",
          itemCount: 1,
          totalCount: 1,
          truncated: false,
          limit: 1,
          jsonBytes: 40,
        }),
      ],
      now,
    );
    expect(metrics.days).toHaveLength(7);
    expect(metrics.days[0]?.date).toBe("2026-09-05");
    expect(metrics.days[5]).toMatchObject({
      date: "2026-09-10",
      listCalls: 1,
      truncatedCalls: 1,
      chatCalls: 1,
      jobCalls: 0,
    });
    expect(metrics.days[6]).toMatchObject({
      date: "2026-09-11",
      listCalls: 2,
      truncatedCalls: 1,
      chatCalls: 1,
      jobCalls: 1,
    });
    expect(metrics.days[6]?.bytesKeptRatio).not.toBeNull();
    expect(metrics.chatCalls).toBe(2);
    expect(metrics.jobCalls).toBe(1);
    expect(metrics.days[1]?.listCalls).toBe(0);
    expect(metrics.dumpNotServedBytes).toBeGreaterThan(0);
    expect(metrics.cutShortRate).toBeCloseTo(2 / 3);
  });

  it("groups hosts and never reports 0% for an empty grain window", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const withHost = summarizeEnvelopeLedger(
      [
        entry({
          ts: "2026-09-11T11:00:00.000Z",
          tool: "search_symbols",
          itemCount: 50,
          totalCount: 100,
          truncated: true,
          jsonBytes: 100,
          host: "cursor",
        }),
        entry({
          ts: "2026-09-11T11:02:00.000Z",
          tool: "find_symbol",
          jobId: "cli-sarif",
          host: "claude",
          itemCount: 1,
          totalCount: 1,
          jsonBytes: 40,
        }),
      ],
      now,
    );
    expect(withHost.hosts.map((row) => row.host)).toEqual(["claude", "cursor"]);
    expect(withHost.hosts[1]).toMatchObject({
      host: "cursor",
      firstTs: "2026-09-11T11:00:00.000Z",
      lastTs: "2026-09-11T11:00:00.000Z",
      topTools: [{ tool: "search_symbols", calls: 1 }],
    });
    expect(withHost.peakDump).toMatchObject({
      tool: "search_symbols",
      itemCount: 50,
      totalCount: 100,
    });
    const none = summarizeEnvelopeLedger([], now, { grain: "weekly" });
    expect(none.available).toBe(false);
    expect(none.cutShortRate).toBeNull();
    expect(none.buckets).toEqual([]);
    expect(none.bytesKeptRatio).toBeNull();
  });

  it("treats toMs as exclusive so a date-only custom range is not an extra day", () => {
    const fromMs = new Date(2026, 8, 6).getTime();
    const toMs = new Date(2026, 8, 13).getTime();
    const metrics = summarizeEnvelopeLedger(
      [
        entry({
          ts: "2026-09-12T08:00:00.000Z",
          tool: "find_symbol",
        }),
      ],
      Date.parse("2026-09-12T12:00:00.000Z"),
      { fromMs, toMs, grain: "daily" },
    );
    expect(metrics.buckets.map((row) => row.key)).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
    expect(metrics.buckets[0]).toMatchObject({
      fromMs: new Date(2026, 8, 6).getTime(),
      toMs: new Date(2026, 8, 7).getTime(),
    });
  });

  it("weekly buckets span local Monday through Sunday", () => {
    const fromMs = new Date(2026, 8, 7).getTime();
    const toMs = new Date(2026, 8, 14).getTime();
    const metrics = summarizeEnvelopeLedger(
      [
        entry({
          ts: new Date(2026, 8, 9, 12).toISOString(),
          tool: "find_symbol",
        }),
      ],
      new Date(2026, 8, 9, 12).getTime(),
      { fromMs, toMs, grain: "weekly" },
    );
    expect(metrics.buckets).toHaveLength(1);
    expect(metrics.buckets[0]?.fromMs).toBe(new Date(2026, 8, 7).getTime());
    expect(metrics.buckets[0]?.toMs).toBe(new Date(2026, 8, 14).getTime());
  });

  it("counts follow-through when the next call is find_symbol", () => {
    const now = Date.parse("2026-09-11T12:00:00Z");
    const metrics = summarizeEnvelopeLedger(
      [
        entry({
          ts: "2026-09-11T11:00:00.000Z",
          tool: "search_symbols",
          truncated: true,
          itemCount: 50,
          totalCount: 80,
        }),
        entry({
          ts: "2026-09-11T11:01:00.000Z",
          tool: "find_symbol",
          itemCount: 1,
          totalCount: 1,
          truncated: false,
          limit: 1,
        }),
      ],
      now,
    );
    expect(metrics.followThrough).toBe(1);
    expect(metrics.provenance.followThrough).toBe("heuristic");
  });

  it("keeps an unknown host with tools and span instead of dropping it", () => {
    const now = Date.parse("2026-09-11T12:00:00Z");
    const metrics = summarizeEnvelopeLedger(
      [
        entry({
          ts: "2026-09-11T10:00:00.000Z",
          tool: "blast_radius",
          itemCount: 4,
          totalCount: 4,
        }),
        entry({
          ts: "2026-09-11T11:00:00.000Z",
          tool: "find_symbol",
          itemCount: 1,
          totalCount: 1,
          clientName: "cursor-vscode",
          clientVersion: "1.7.0",
        }),
      ],
      now,
    );
    expect(metrics.hosts).toHaveLength(1);
    expect(metrics.hosts[0]).toMatchObject({
      host: "unknown",
      listCalls: 2,
      chatCalls: 2,
      clientNames: ["cursor-vscode"],
      clientVersions: ["1.7.0"],
      firstTs: "2026-09-11T10:00:00.000Z",
      lastTs: "2026-09-11T11:00:00.000Z",
    });
    expect(metrics.hosts[0]?.topTools.map((row) => row.tool)).toEqual([
      "blast_radius",
      "find_symbol",
    ]);
  });
});

describe("summarizeJobEnvelope", () => {
  it("is unavailable when the job has no tagged Intelligence calls", () => {
    expect(
      summarizeJobEnvelope(
        [
          entry({
            ts: "2026-09-11T11:00:00.000Z",
            tool: "find_symbol",
          }),
        ],
        "review-the-issues",
      ),
    ).toMatchObject({ available: false, calls: 0, tokensSaved: null });
  });

  it("estimates tokens not dumped from truncated list calls", () => {
    const metrics = summarizeJobEnvelope(
      [
        entry({
          ts: "2026-09-11T11:00:00.000Z",
          tool: "search_symbols",
          jobId: "review-the-issues",
          itemCount: 50,
          totalCount: 100,
          truncated: true,
          jsonBytes: 400,
        }),
        entry({
          ts: "2026-09-11T11:01:00.000Z",
          tool: "find_symbol",
          jobId: "other-job",
          jsonBytes: 800,
        }),
      ],
      "review-the-issues",
    );
    expect(metrics.available).toBe(true);
    expect(metrics.calls).toBe(1);
    expect(metrics.bytesKeptRatio).toBeCloseTo(0.5);
    expect(metrics.tokensSaved).toBe(100);
  });
});

describe("envelope ledger files", () => {
  const temps: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    temps.push(dir);
    return dir;
  }

  it("writes to PRISM_HOME and tags the workspace", async () => {
    const home = await tempDir("prism-env-home-");
    const repo = await tempDir("prism-env-repo-");
    const env = { PRISM_HOME: home };
    await appendEnvelopeLedger(
      repo,
      {
        ts: "2026-09-12T00:00:00.000Z",
        tool: "find_symbol",
        itemCount: 1,
        totalCount: 1,
        truncated: false,
        limit: 12,
        jsonBytes: 40,
        host: "cursor",
      },
      env,
    );
    const parsed = JSON.parse(
      (await readFile(envelopeLedgerPath(env), "utf8")).trim(),
    ) as Record<string, unknown>;
    expect(parsed.workspace).toBe(repo);
    expect(parsed.host).toBe("cursor");
    const rows = await readEnvelopeLedger(repo, env);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tool).toBe("find_symbol");
  });

  it("filters global rows by workspace and still reads a legacy repo file", async () => {
    const home = await tempDir("prism-env-home-");
    const repo = await tempDir("prism-env-repo-");
    const other = await tempDir("prism-env-other-");
    const env = { PRISM_HOME: home };
    await appendEnvelopeLedger(
      other,
      {
        ts: "2026-09-12T01:00:00.000Z",
        tool: "list_packages",
        itemCount: 1,
        totalCount: 1,
        truncated: false,
        limit: 40,
        jsonBytes: 20,
      },
      env,
    );
    await mkdir(join(repo, ".prism"), { recursive: true });
    await writeFile(
      join(repo, ".prism", "envelope-ledger.jsonl"),
      `${JSON.stringify({
        ts: "2026-09-11T00:00:00.000Z",
        tool: "search_symbols",
        itemCount: 50,
        totalCount: 80,
        truncated: true,
        limit: 50,
        jsonBytes: 1200,
      })}\n`,
    );
    const rows = await readEnvelopeLedger(repo, env);
    expect(rows.map((row) => row.tool)).toEqual(["search_symbols"]);
  });
});

describe("summarizeEnvelopeLedger all-time window", () => {
  it("does not paint daily buckets from 1970 when fromMs is 0", () => {
    const metrics = summarizeEnvelopeLedger(
      [
        entry({
          ts: "2026-09-12T12:00:00.000Z",
          tool: "find_symbol",
        }),
      ],
      Date.parse("2026-09-12T18:00:00Z"),
      { fromMs: 0, toMs: Date.parse("2026-09-12T18:00:00Z"), grain: "daily" },
    );
    expect(metrics.available).toBe(true);
    expect(metrics.buckets.length).toBeLessThan(14);
    expect(metrics.buckets.some((row) => row.listCalls > 0)).toBe(true);
  });
});
