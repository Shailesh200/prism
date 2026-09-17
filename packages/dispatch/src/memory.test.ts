import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatMemoriesForPrompt,
  loadMemories,
  migrateMemoriesOnRename,
  remember,
} from "./memory.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("remember anchors (M-075 M1)", () => {
  it("persists optional symbol and path, omits them when absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-remember-"));
    temps.push(root);
    await mkdir(join(root, ".prism"), { recursive: true });
    const anchored = await remember({
      workspaceRoot: root,
      text: "keep fetchUser cache-free",
      scope: "repo",
      symbol: "fetchUser",
      path: "src/users/fetchUser.ts",
    });
    const plain = await remember({
      workspaceRoot: root,
      text: "no anchor",
      scope: "repo",
    });
    expect(anchored.symbol).toBe("fetchUser");
    expect(anchored.path).toBe("src/users/fetchUser.ts");
    expect(plain.symbol).toBeUndefined();
    expect(plain.path).toBeUndefined();
    const items = await loadMemories(root);
    expect(items).toHaveLength(2);
    expect(formatMemoriesForPrompt(items)).toContain("fetchUser");
    expect(formatMemoriesForPrompt(items)).toContain("src/users/fetchUser.ts");
  });

  it("rewrites a symbol-anchored memory when a rename is applied", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-remember-ren-"));
    temps.push(root);
    await mkdir(join(root, ".prism"), { recursive: true });
    await remember({
      workspaceRoot: root,
      text: "keep cache-free",
      scope: "repo",
      symbol: "fetchUser",
    });
    const moved = await migrateMemoriesOnRename(root, {
      kind: "symbol",
      from: "fetchUser",
      to: "loadUser",
    });
    expect(moved).toBe(1);
    const items = await loadMemories(root);
    expect(items[0]?.symbol).toBe("loadUser");
  });
});
