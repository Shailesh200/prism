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
import { runWithJobsEnv, upsertJob } from "./jobs.js";
import { assertWipeHome, confirmWipePhrase, wipePrismData } from "./wipe.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("wipePrismData", () => {
  it("accepts the wipe confirmation phrase case-insensitively", () => {
    expect(confirmWipePhrase("wipe")).toBe(true);
    expect(confirmWipePhrase(" WIPE ")).toBe(true);
    expect(confirmWipePhrase("delete")).toBe(false);
  });

  it("refuses to wipe the default library during tests", () => {
    expect(() => assertWipeHome({ BUN_TEST: "1" })).toThrow(
      /default Prism library/,
    );
  });

  it("removes the library and each repo .prism folder", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-wipe-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-wipe-repo-"));
    temps.push(home, repo);
    const env = { ...process.env, PRISM_HOME: home, BUN_TEST: "1" };
    await runWithJobsEnv(env, () =>
      upsertJob(repo, {
        id: "ghost",
        title: "Ghost",
        playbook: "ticket",
        prd: "",
        branch: "main",
        worktreePath: repo,
        source: "prism",
        status: "done",
        lastStep: "",
        nextStep: "",
        waitingOn: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    await mkdir(join(repo, ".prism", "cache"), { recursive: true });
    await writeFile(join(repo, ".prism", "envelope-ledger.jsonl"), "{}\n");
    await writeFile(join(repo, "keep.ts"), "export {}\n");

    const result = await wipePrismData([repo], env);
    expect(result.home).toBe(home);
    expect(result.repos).toContain(repo);

    await expect(access(home)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(repo, ".prism"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(join(repo, "keep.ts"), "utf8")).toContain("export");
  });
});
