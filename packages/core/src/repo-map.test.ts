import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Prism } from "./index.js";

const dirs: string[] = [];
const saved = process.env.PRISM_HOME;
afterEach(() => {
  if (saved === undefined) delete process.env.PRISM_HOME;
  else process.env.PRISM_HOME = saved;
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("repo map cache", () => {
  it("an unchanged repo indexed again reuses the map; an edit rebuilds it", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-map-repo-"));
    const home = mkdtempSync(join(tmpdir(), "prism-map-home-"));
    dirs.push(root, home);
    process.env.PRISM_HOME = home;
    writeFileSync(
      join(root, "a.ts"),
      'import { b } from "./b";\nexport const a = b;\n',
    );
    writeFileSync(join(root, "b.ts"), "export const b = 1;\n");
    const map = async () => {
      const ws = Prism.create().openRepository(root);
      if (!ws.ok) throw new Error(ws.error.message);
      await ws.value.index();
      const result = ws.value.repoMap({ maxTokens: 600 });
      ws.value.close();
      return result.ok && result.value.fromCache;
    };
    expect(await map()).toBe(false);
    expect(await map()).toBe(true);
    writeFileSync(join(root, "b.ts"), "export const b = 2;\n");
    expect(await map()).toBe(false);
  });
});
