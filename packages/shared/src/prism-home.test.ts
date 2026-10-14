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
  forgetWorkspaceMemory,
  legacyWorkspaceMemoryPath,
  loadWorkspaceMemories,
  migrateWorkspaceMemories,
  rememberWorkspaceMemory,
  useLocalPrismStore,
  workspaceKey,
  workspaceMemoryPath,
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
    await writeFile(join(repo, ".prism", "notes.json"), "{}");
    const dest = await ensureWorkspacePrism(repo, env);
    expect(dest).toBe(join(home, "workspaces", workspaceKey(repo)));
    expect(await readFile(join(dest, "cache", "index.txt"), "utf8")).toBe(
      "idx",
    );
    expect(await readFile(join(dest, "notes.json"), "utf8")).toBe("{}");
    await expect(access(join(repo, ".prism"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("migrates symbol-anchored memories on rename (M-075)", async () => {
    const repo = await mkdtemp(join(tmpdir(), "prism-mem-"));
    temps.push(repo);
    const env = { VITEST: "true" };
    await mkdir(join(repo, ".prism"), { recursive: true });
    await writeFile(
      workspaceMemoryPath(repo, env),
      JSON.stringify({
        items: [
          { id: "1", text: "keep cache-free", symbol: "fetchUser" },
          { id: "2", text: "other", symbol: "lruCache" },
        ],
      }),
    );
    const moved = await migrateWorkspaceMemories(
      repo,
      { kind: "symbol", from: "fetchUser", to: "loadUser" },
      env,
    );
    expect(moved).toBe(1);
    const items = await loadWorkspaceMemories(repo, env);
    expect(items.find((i) => i.id === "1")?.symbol).toBe("loadUser");
    expect(items.find((i) => i.id === "2")?.symbol).toBe("lruCache");
  });

  it("reads memories Dispatch wrote before M-091, then writes the new home", async () => {
    const repo = await mkdtemp(join(tmpdir(), "prism-mem-legacy-"));
    temps.push(repo);
    const env = { VITEST: "true" };
    await mkdir(join(repo, ".prism", "dispatch"), { recursive: true });
    await writeFile(
      legacyWorkspaceMemoryPath(repo, env),
      JSON.stringify({
        items: [
          {
            id: "old",
            scope: "repo",
            text: "use lruCache, never a Map",
            source: "user",
            createdAt: "2026-09-01T00:00:00.000Z",
            symbol: "lruCache",
          },
        ],
      }),
    );
    expect((await loadWorkspaceMemories(repo, env)).map((m) => m.id)).toEqual([
      "old",
    ]);
    await expect(
      access(legacyWorkspaceMemoryPath(repo, env)),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const added = await rememberWorkspaceMemory(
      repo,
      { text: "tests live beside the source", path: "src" },
      env,
    );
    expect((await loadWorkspaceMemories(repo, env)).map((m) => m.text)).toEqual(
      ["use lruCache, never a Map", "tests live beside the source"],
    );
    expect(await forgetWorkspaceMemory(repo, added.id!, env)).toBe(1);
    expect(await forgetWorkspaceMemory(repo, "LRUCACHE", env)).toBe(1);
    expect(await loadWorkspaceMemories(repo, env)).toEqual([]);
  });
});
