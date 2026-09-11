import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listStoredWorkspaceRoots,
  loadJobs,
  runWithJobsEnv,
  upsertJob,
} from "./jobs.js";
import { jobsMetaPath, jobsPath, legacyJobsPath } from "./paths.js";
import type { JobRecord } from "./types.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function job(patch: Partial<JobRecord>): JobRecord {
  const now = "2026-09-10T00:00:00.000Z";
  return {
    id: "news-tab",
    title: "Fix highlight",
    playbook: "ticket",
    prd: "Make the news tab highlight.",
    branch: "main",
    worktreePath: "/tmp/wt",
    source: "prism",
    status: "done",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
    ...patch,
  };
}

describe("global job store", () => {
  it("lifts repo-level jobs.json into ~/.prism and keeps a single copy", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-jobs-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-jobs-repo-"));
    temps.push(home, repo);
    const env = { PRISM_HOME: home };
    await mkdir(join(repo, ".prism", "dispatch"), { recursive: true });
    await writeFile(
      legacyJobsPath(repo),
      `${JSON.stringify({ jobs: [job({})] }, null, 2)}\n`,
    );
    const listed = await runWithJobsEnv(env, () => loadJobs(repo));
    expect(listed).toHaveLength(1);
    expect(listed[0]?.prd).toBe("Make the news tab highlight.");
    expect(jobsPath(repo, env)).toContain(join(home, "dispatch", "workspaces"));
    const retired = await readFile(`${legacyJobsPath(repo)}.migrated`, "utf8");
    expect(retired).toContain("news-tab");
    expect(await listStoredWorkspaceRoots(env)).toContain(repo);
    await runWithJobsEnv(env, () =>
      upsertJob(repo, job({ title: "Fix highlight again" })),
    );
    expect((await runWithJobsEnv(env, () => loadJobs(repo)))[0]?.title).toBe(
      "Fix highlight again",
    );
  });

  it("lifts a leftover repo jobs.json after the first migrate", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-jobs-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-jobs-repo-"));
    temps.push(home, repo);
    const env = { PRISM_HOME: home };
    await runWithJobsEnv(env, () =>
      upsertJob(repo, job({ id: "first", title: "First" })),
    );
    await mkdir(join(repo, ".prism", "dispatch"), { recursive: true });
    await writeFile(
      legacyJobsPath(repo),
      `${JSON.stringify({ jobs: [job({ id: "late", title: "Late" })] }, null, 2)}\n`,
    );
    const listed = await runWithJobsEnv(env, () => loadJobs(repo));
    expect(listed.map((row) => row.id).sort()).toEqual(["first", "late"]);
  });

  it("lifts a leftover status change even when updatedAt is unchanged", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-jobs-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-jobs-repo-"));
    temps.push(home, repo);
    const env = { PRISM_HOME: home };
    const stamp = "2026-09-10T00:00:00.000Z";
    const globalFile = jobsPath(repo, env);
    await mkdir(dirname(globalFile), { recursive: true });
    await writeFile(
      globalFile,
      `${JSON.stringify({ jobs: [job({ status: "running", updatedAt: stamp })] }, null, 2)}\n`,
    );
    await writeFile(
      jobsMetaPath(repo, env),
      `${JSON.stringify({ path: repo, migratedAt: stamp }, null, 2)}\n`,
    );
    await mkdir(join(repo, ".prism", "dispatch"), { recursive: true });
    await writeFile(
      legacyJobsPath(repo),
      `${JSON.stringify({ jobs: [job({ status: "done", updatedAt: stamp })] }, null, 2)}\n`,
    );
    const listed = await runWithJobsEnv(env, () => loadJobs(repo));
    expect(listed[0]?.status).toBe("done");
  });

  it("does not persist an empty list when jobs.json is unreadable", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-jobs-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-jobs-repo-"));
    temps.push(home, repo);
    const env = { PRISM_HOME: home };
    const globalFile = jobsPath(repo, env);
    await mkdir(dirname(globalFile), { recursive: true });
    await writeFile(globalFile, "{\n");
    await expect(runWithJobsEnv(env, () => loadJobs(repo))).rejects.toThrow();
    expect(await readFile(globalFile, "utf8")).toBe("{\n");
  });

  it("clears a leftover jobs lock file", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-jobs-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-jobs-repo-"));
    temps.push(home, repo);
    const env = { PRISM_HOME: home };
    const lock = `${jobsPath(repo, env)}.lock`;
    await mkdir(dirname(lock), { recursive: true });
    await writeFile(lock, "stale");
    const old = new Date(Date.now() - 10_000);
    await utimes(lock, old, old);
    await runWithJobsEnv(env, () => upsertJob(repo, job({})));
    expect((await runWithJobsEnv(env, () => loadJobs(repo)))[0]?.id).toBe(
      "news-tab",
    );
  });

  it("recovers jobs from jobs.json.migrated when the global file is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-jobs-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-jobs-repo-"));
    temps.push(home, repo);
    const env = { PRISM_HOME: home };
    await mkdir(join(repo, ".prism", "dispatch"), { recursive: true });
    await writeFile(
      `${legacyJobsPath(repo)}.migrated`,
      `${JSON.stringify({ jobs: [job({ id: "recovered" })] }, null, 2)}\n`,
    );
    const listed = await runWithJobsEnv(env, () => loadJobs(repo));
    expect(listed.map((row) => row.id)).toEqual(["recovered"]);
    const globalRaw = await readFile(jobsPath(repo, env), "utf8");
    expect(globalRaw).toContain("recovered");
  });

  it("does not resurrect .migrated jobs after the user emptied the global store", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-jobs-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-jobs-repo-"));
    temps.push(home, repo);
    const env = { PRISM_HOME: home };
    await runWithJobsEnv(env, () => upsertJob(repo, job({ id: "kept" })));
    await writeFile(
      jobsPath(repo, env),
      `${JSON.stringify({ jobs: [] }, null, 2)}\n`,
    );
    await mkdir(join(repo, ".prism", "dispatch"), { recursive: true });
    await writeFile(
      `${legacyJobsPath(repo)}.migrated`,
      `${JSON.stringify({ jobs: [job({ id: "stale" })] }, null, 2)}\n`,
    );
    const listed = await runWithJobsEnv(env, () => loadJobs(repo));
    expect(listed).toEqual([]);
  });
});
