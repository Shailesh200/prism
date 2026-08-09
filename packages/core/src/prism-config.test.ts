import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Prism } from "./prism.js";
import { loadPrismConfigSync } from "./prism-config-load.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prism-config-"));
  dirs.push(dir);
  return dir;
}

describe("prism config load (M-057 P-B6)", () => {
  it("returns empty config when the file is missing", () => {
    const result = loadPrismConfigSync(process.cwd());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({});
  });

  it("loads excludeGlobs from .prism/config.json into the index path", async () => {
    const root = await tempRoot();
    await mkdir(join(root, ".prism"), { recursive: true });
    await writeFile(
      join(root, ".prism", "config.json"),
      JSON.stringify({
        excludeGlobs: ["secret-vendor/**"],
        maxFileBytes: 1024,
      }),
      "utf8",
    );
    await mkdir(join(root, "secret-vendor"), { recursive: true });
    await writeFile(
      join(root, "secret-vendor", "x.ts"),
      "export const x = 1;\n",
    );
    await writeFile(join(root, "keep.ts"), "export const keep = 1;\n");

    const opened = Prism.create().openRepository(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const indexed = await opened.value.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;
    const paths = indexed.value.files.map((f) => f.path);
    expect(paths).toContain("keep.ts");
    expect(paths).not.toContain("secret-vendor/x.ts");
    opened.value.close();
  });

  it("lets index() flags override config maxFileBytes", async () => {
    const root = await tempRoot();
    await mkdir(join(root, ".prism"), { recursive: true });
    await writeFile(
      join(root, ".prism", "config.json"),
      JSON.stringify({ maxFileBytes: 10 }),
      "utf8",
    );
    // ~40 bytes — over config limit, under flag limit
    await writeFile(join(root, "mid.ts"), "export const value = 1234567890;\n");

    const opened = Prism.create().openRepository(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const withFlag = await opened.value.index({ maxFileBytes: 10_000 });
    expect(withFlag.ok).toBe(true);
    if (withFlag.ok) {
      const mid = withFlag.value.files.find((f) => f.path === "mid.ts");
      expect(mid?.status).toBe("analyzed");
    }
    opened.value.close();
  });
});
