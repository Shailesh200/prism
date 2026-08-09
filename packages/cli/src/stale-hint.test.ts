import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { unsafeRepoId, type IndexSnapshot } from "@repo-prism/shared";
import { indexLooksStale } from "./stale-hint.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("indexLooksStale (M-057 P-B11)", () => {
  it("is false when files are older than indexedAt", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-stale-"));
    dirs.push(root);
    const path = join(root, "a.ts");
    await writeFile(path, "export {};\n");
    const past = new Date(Date.now() - 60_000);
    await utimes(path, past, past);

    const snapshot = makeSnapshot(root, new Date().toISOString());
    expect(await indexLooksStale(snapshot)).toBe(false);
  });

  it("is true when a sampled file is newer than indexedAt", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-stale-"));
    dirs.push(root);
    await mkdir(root, { recursive: true });
    const path = join(root, "a.ts");
    await writeFile(path, "export {};\n");

    const snapshot = makeSnapshot(
      root,
      new Date(Date.now() - 60_000).toISOString(),
    );
    expect(await indexLooksStale(snapshot)).toBe(true);
  });
});

function makeSnapshot(root: string, indexedAt: string): IndexSnapshot {
  return {
    repoId: unsafeRepoId("repo:test"),
    rootPath: root,
    indexedAt,
    files: [
      {
        path: "a.ts",
        pluginId: "ts",
        contentHash: "x",
        status: "analyzed",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
    ],
    stats: {
      filesTotal: 1,
      filesIndexed: 1,
      filesSkipped: 0,
      durationMs: 1,
    },
    warnings: [],
  };
}
