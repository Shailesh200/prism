import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "./config.js";
import { prismHome, repoConfigPath } from "./paths.js";

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

describe("user-global Dispatch config (ADR-0047)", () => {
  it("does not use ~/.prism for a temp workspace without PRISM_HOME", () => {
    const tmp = join(tmpdir(), "prism-repo-example");
    expect(prismHome(tmp)).toBe(join(tmp, ".prism-home"));
    expect(prismHome(tmp)).not.toBe(join(homedir(), ".prism"));
  });

  it("shares settings across two workspaces when PRISM_HOME is the same", async () => {
    const home = await tempDir("prism-home-");
    const env = { ...process.env, PRISM_HOME: home };
    const repoA = await tempDir("prism-repo-a-");
    const repoB = await tempDir("prism-repo-b-");
    await saveConfig(
      repoA,
      { dispatchMode: "auto", placement: "worktree", workerBackend: "claude" },
      env,
    );
    const fromB = await loadConfig(repoB, env);
    expect(fromB.dispatchMode).toBe("auto");
    expect(fromB.placement).toBe("worktree");
    expect(fromB.workerBackend).toBe("claude");
  });

  it("migrates a leftover in-repo config.json into ~/.prism once", async () => {
    const home = await tempDir("prism-home-");
    const env = { ...process.env, PRISM_HOME: home };
    const repo = await tempDir("prism-repo-");
    const legacy = repoConfigPath(repo);
    await mkdir(join(repo, ".prism", "dispatch"), { recursive: true });
    await writeFile(
      legacy,
      `${JSON.stringify({ dispatchMode: "inline", maxJobs: 6 }, null, 2)}\n`,
    );
    const first = await loadConfig(repo, env);
    expect(first.dispatchMode).toBe("inline");
    expect(first.maxJobs).toBe(6);
    await writeFile(
      legacy,
      `${JSON.stringify({ dispatchMode: "auto", maxJobs: 1 }, null, 2)}\n`,
    );
    const afterStaleRepoFile = await loadConfig(repo, env);
    expect(afterStaleRepoFile.dispatchMode).toBe("inline");
    expect(afterStaleRepoFile.maxJobs).toBe(6);
  });
});
