import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  IndexSnapshotSchema,
  PrismErrorCode,
  type IndexProgressEvent,
} from "@repo-prism/shared";
import { runIndexJob, snapshotToSummary } from "./index-job.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "m007-mini",
);

async function tempCachePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prism-m007-cache-"));
  return join(dir, "index.sqlite");
}

describe("runIndexJob", () => {
  it("produces a stable golden snapshot for the mini fixture", async () => {
    const result = await runIndexJob(fixtureRoot, {
      concurrency: 2,
      cacheDbPath: await tempCachePath(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = IndexSnapshotSchema.safeParse(result.value);
    expect(parsed.success).toBe(true);

    const paths = result.value.files.map((f) => f.path);
    expect(paths).toEqual(["notes.md", "package.json", "src/a.ts", "src/b.ts"]);

    const a = result.value.files.find((f) => f.path === "src/a.ts");
    const b = result.value.files.find((f) => f.path === "src/b.ts");
    const notes = result.value.files.find((f) => f.path === "notes.md");
    expect(a?.status).toBe("analyzed");
    expect(b?.status).toBe("analyzed");
    expect(notes?.status).toBe("skipped_unsupported");

    expect(a?.symbols.some((s) => s.name === "a" && s.exported)).toBe(true);
    expect(a?.imports).toEqual([
      expect.objectContaining({ source: "./b.js", specifiers: ["b"] }),
    ]);
    expect(b?.exports.some((e) => e.name === "b")).toBe(true);

    expect(result.value.stats.filesIndexed).toBe(2);
    expect(result.value.stats.filesSkipped).toBe(2);

    const summary = snapshotToSummary(result.value);
    expect(summary.stats.filesIndexed).toBe(2);
  });

  it("emits inventory → cache → analyze → finalize progress events", async () => {
    const events: IndexProgressEvent[] = [];
    const result = await runIndexJob(fixtureRoot, {
      concurrency: 1,
      cacheDbPath: await tempCachePath(),
      onProgress: (e) => events.push(e),
    });
    expect(result.ok).toBe(true);
    expect(events.some((e) => e.phase === "inventory")).toBe(true);
    expect(events.some((e) => e.phase === "cache")).toBe(true);
    expect(events.some((e) => e.phase === "analyze")).toBe(true);
    expect(events.some((e) => e.phase === "finalize")).toBe(true);
    expect(events.filter((e) => e.phase === "analyze" && e.path).length).toBe(
      4,
    );
  });

  it("honours AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runIndexJob(fixtureRoot, {
      signal: controller.signal,
      cache: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(PrismErrorCode.CANCELLED);
  });

  it("ONB-4 caps code files package-first; other files are kept free", async () => {
    const result = await runIndexJob(fixtureRoot, {
      cache: false,
      maxAnalyzeFiles: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stats.filesIndexed).toBe(1);
    expect(result.value.files.map((f) => f.path)).toContain("notes.md");
    expect(result.value.warnings).toContain(
      "partial index: analyzed 1 of 2 code files (top packages first)",
    );
  });

  it("a partial index keeps the full cache: the next full index reuses it all", async () => {
    const cacheDbPath = await tempCachePath();
    await runIndexJob(fixtureRoot, { cacheDbPath });
    await runIndexJob(fixtureRoot, { cacheDbPath, maxAnalyzeFiles: 1 });
    const full = await runIndexJob(fixtureRoot, { cacheDbPath });
    expect(full.ok && full.value.cache).toMatchObject({ filesAnalyzed: 0 });
  });
});
