import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureWorkspacePrism,
  useLocalPrismStore,
  workspaceKey,
  workspacePrismDir,
} from "./prism-home.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("workspace prism home", () => {
  it("is not re-exported from the browser barrel", async () => {
    const barrel = await import("./index.js");
    expect("workspacePrismDir" in barrel).toBe(false);
    expect("ensureWorkspacePrism" in barrel).toBe(false);
  });

  it("keeps fixture trees under the repo during tests", () => {
    expect(useLocalPrismStore({ VITEST: "true" })).toBe(true);
    expect(workspacePrismDir("/repo", { VITEST: "true" })).toBe(
      join("/repo", ".prism"),
    );
  });

  it("lifts leftover checkout .prism into ~/.prism/workspaces/<key>", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-repo-"));
    temps.push(home, repo);
    const env = { PRISM_HOME: home };
    await mkdir(join(repo, ".prism", "cache"), { recursive: true });
    await writeFile(join(repo, ".prism", "cache", "index.txt"), "idx");
    await writeFile(join(repo, ".prism", "consent.json"), "{}");
    const dest = await ensureWorkspacePrism(repo, env);
    expect(dest).toBe(join(home, "workspaces", workspaceKey(repo)));
    expect(await readFile(join(dest, "cache", "index.txt"), "utf8")).toBe(
      "idx",
    );
    expect(await readFile(join(dest, "consent.json"), "utf8")).toBe("{}");
    await expect(access(join(repo, ".prism"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
