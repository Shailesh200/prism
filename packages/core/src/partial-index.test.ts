import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { partialIndexOf } from "@repo-prism/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Prism } from "./prism.js";
import type { PrismWorkspace } from "./workspace.js";

let root: string;
let ws: PrismWorkspace;
let savedPrismHome: string | undefined;

beforeEach(async () => {
  savedPrismHome = process.env.PRISM_HOME;
  delete process.env.PRISM_HOME;
  root = await mkdtemp(join(tmpdir(), "prism-partial-"));
  await writeFile(join(root, "package.json"), '{"name":"fixture"}\n', "utf8");
  for (const name of ["a", "b", "c"]) {
    await writeFile(join(root, `${name}.ts`), `export const ${name} = 1;\n`);
  }
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) throw new Error("failed to open workspace");
  ws = opened.value;
});

afterEach(async () => {
  ws.close();
  await rm(root, { recursive: true, force: true });
  if (savedPrismHome === undefined) delete process.env.PRISM_HOME;
  else process.env.PRISM_HOME = savedPrismHome;
});

describe("partial index flag across reindexes (round 4)", () => {
  it("a dirty run on a capped index stays partial; a full run clears it", async () => {
    const capped = await ws.index({ maxAnalyzeFiles: 1 });
    if (!capped.ok) throw new Error(capped.error.message);
    expect(partialIndexOf(capped.value.warnings)).toEqual({
      analyzed: 1,
      total: 3,
    });

    await writeFile(join(root, "a.ts"), "export const a = 2;\n");
    const dirty = await ws.index({ changedPaths: ["a.ts"] });
    if (!dirty.ok) throw new Error(dirty.error.message);
    expect(partialIndexOf(dirty.value.warnings)).toEqual({
      analyzed: 1,
      total: 3,
    });

    const full = await ws.index();
    if (!full.ok) throw new Error(full.error.message);
    expect(partialIndexOf(full.value.warnings)).toBeNull();
    expect(full.value.stats.filesIndexed).toBeGreaterThanOrEqual(3);
  });
});
