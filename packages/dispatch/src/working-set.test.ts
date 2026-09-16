import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  mergeWorkingSet,
  readStandaloneWorkingSet,
  writeStandaloneWorkingSet,
} from "./working-set.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tempHome(): Promise<NodeJS.ProcessEnv> {
  const dir = await mkdtemp(join(tmpdir(), "prism-working-set-"));
  temps.push(dir);
  return { PRISM_HOME: dir };
}

describe("mergeWorkingSet (M-073 W1/W2)", () => {
  it("unions and dedupes each list", () => {
    const merged = mergeWorkingSet(
      { files: ["a.ts"], symbols: [], decisions: ["use X"], neighbors: [] },
      { files: ["a.ts", "b.ts"], symbols: ["foo"] },
    );
    expect(merged.files).toEqual(["a.ts", "b.ts"]);
    expect(merged.symbols).toEqual(["foo"]);
    expect(merged.decisions).toEqual(["use X"]);
  });

  it("caps each list at 50, keeping the most recent", () => {
    const many = Array.from({ length: 60 }, (_, i) => `file${i}.ts`);
    const merged = mergeWorkingSet(undefined, { files: many });
    expect(merged.files).toHaveLength(50);
    expect(merged.files[0]).toBe("file10.ts");
    expect(merged.files.at(-1)).toBe("file59.ts");
  });
});

describe("standalone working set (M-073 W2, inline sessions)", () => {
  it("persists per workspace and merges across writes", async () => {
    const env = await tempHome();
    const workspaceRoot = "/repo/one";

    const empty = await readStandaloneWorkingSet(workspaceRoot, env);
    expect(empty.files).toEqual([]);

    await writeStandaloneWorkingSet(workspaceRoot, { files: ["a.ts"] }, env);
    const afterFirst = await writeStandaloneWorkingSet(
      workspaceRoot,
      { files: ["b.ts"], decisions: ["prefer composition"] },
      env,
    );
    expect(afterFirst.files).toEqual(["a.ts", "b.ts"]);
    expect(afterFirst.decisions).toEqual(["prefer composition"]);

    const reread = await readStandaloneWorkingSet(workspaceRoot, env);
    expect(reread).toEqual(afterFirst);

    // A different workspace gets its own set.
    const other = await readStandaloneWorkingSet("/repo/two", env);
    expect(other.files).toEqual([]);
  });
});
