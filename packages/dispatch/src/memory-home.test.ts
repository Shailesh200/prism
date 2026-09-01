import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { forgetMemory, loadMemories, remember } from "./memory.js";

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

describe("user-scoped memories (ADR-0047)", () => {
  it("shares user memories across repos and keeps repo memories local", async () => {
    const home = await tempDir("prism-home-");
    const env = { ...process.env, PRISM_HOME: home };
    const repoA = await tempDir("prism-repo-a-");
    const repoB = await tempDir("prism-repo-b-");
    await remember({
      workspaceRoot: repoA,
      text: "Greet me as Chief",
      scope: "user",
      env,
    });
    await remember({
      workspaceRoot: repoA,
      text: "This repo prefers bun",
      scope: "repo",
      env,
    });
    const inB = await loadMemories(repoB, env);
    expect(inB.map((item) => item.text)).toEqual(["Greet me as Chief"]);
    const inA = await loadMemories(repoA, env);
    expect(inA.map((item) => item.text).sort()).toEqual([
      "Greet me as Chief",
      "This repo prefers bun",
    ]);
  });

  it("forgets a user memory in every repo", async () => {
    const home = await tempDir("prism-home-");
    const env = { ...process.env, PRISM_HOME: home };
    const repoA = await tempDir("prism-repo-a-");
    const repoB = await tempDir("prism-repo-b-");
    await remember({
      workspaceRoot: repoA,
      text: "Greet me as Chief",
      scope: "user",
      env,
    });
    expect(await forgetMemory(repoB, "Chief", env)).toBe(1);
    expect(await loadMemories(repoA, env)).toEqual([]);
  });
});
