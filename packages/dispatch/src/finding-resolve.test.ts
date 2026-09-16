import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reconcileFindingResolutions } from "./finding-resolve.js";
import { runWithJobsEnv, upsertJob } from "./jobs.js";
import type { JobRecord } from "./types.js";

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function findingJob(patch: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "fix-unused-export",
    title: "Fix: unused export",
    playbook: "ticket",
    prd: "",
    branch: "",
    worktreePath: "",
    source: "prism",
    status: "done",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

describe("reconcileFindingResolutions (M-071 L3)", () => {
  let root: string;
  let home: string;

  afterEach(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    await rm(home, { recursive: true, force: true }).catch(() => undefined);
  });

  it("marks resolved once verification passed and the re-scan finds nothing", async () => {
    root = await tempDir("prism-finding-");
    home = await tempDir("prism-finding-home-");
    const env = { ...process.env, PRISM_HOME: home };
    await runWithJobsEnv(env, () =>
      upsertJob(
        root,
        findingJob({
          verification: "passed",
          findingFingerprint: "fp-1",
          findingSource: "unused_export",
          parentFindingId: "sym-1",
        }),
      ),
    );

    const jobs = await runWithJobsEnv(env, () =>
      reconcileFindingResolutions(root, async () => false),
    );
    expect(
      jobs.find((job) => job.id === "fix-unused-export")?.findingResolution,
    ).toBe("resolved");
  });

  it("leaves the finding open when the re-scan still finds it", async () => {
    root = await tempDir("prism-finding-");
    home = await tempDir("prism-finding-home-");
    const env = { ...process.env, PRISM_HOME: home };
    await runWithJobsEnv(env, () =>
      upsertJob(
        root,
        findingJob({ verification: "passed", findingFingerprint: "fp-1" }),
      ),
    );

    const jobs = await runWithJobsEnv(env, () =>
      reconcileFindingResolutions(root, async () => true),
    );
    expect(
      jobs.find((job) => job.id === "fix-unused-export")?.findingResolution,
    ).toBe("open");
  });

  it("never resolves from job status alone — a failed verification skips the re-scan", async () => {
    root = await tempDir("prism-finding-");
    home = await tempDir("prism-finding-home-");
    const env = { ...process.env, PRISM_HOME: home };
    await runWithJobsEnv(env, () =>
      upsertJob(
        root,
        findingJob({ verification: "failed", findingFingerprint: "fp-1" }),
      ),
    );

    let called = false;
    const jobs = await runWithJobsEnv(env, () =>
      reconcileFindingResolutions(root, async () => {
        called = true;
        return false;
      }),
    );
    expect(called).toBe(false);
    expect(
      jobs.find((job) => job.id === "fix-unused-export")?.findingResolution,
    ).toBeUndefined();
  });

  it("does not re-scan a job with no finding fingerprint", async () => {
    root = await tempDir("prism-finding-");
    home = await tempDir("prism-finding-home-");
    const env = { ...process.env, PRISM_HOME: home };
    await runWithJobsEnv(env, () =>
      upsertJob(root, findingJob({ id: "ordinary", verification: "passed" })),
    );

    let called = false;
    await runWithJobsEnv(env, () =>
      reconcileFindingResolutions(root, async () => {
        called = true;
        return false;
      }),
    );
    expect(called).toBe(false);
  });

  it("does not hold the jobs.json lock while stillOpen is slow", async () => {
    root = await tempDir("prism-finding-");
    home = await tempDir("prism-finding-home-");
    const env = { ...process.env, PRISM_HOME: home };
    await runWithJobsEnv(env, () =>
      upsertJob(
        root,
        findingJob({ verification: "passed", findingFingerprint: "fp-1" }),
      ),
    );

    let concurrentWriteFinishedFirst = false;
    const slowResolve = runWithJobsEnv(env, () =>
      reconcileFindingResolutions(root, async () => {
        await new Promise((r) => setTimeout(r, 300));
        return false;
      }),
    );
    // A concurrent write for a different job must not queue up behind the
    // slow resolver — it should land while the resolver is still running.
    const concurrentWrite = runWithJobsEnv(env, () =>
      upsertJob(root, findingJob({ id: "unrelated-job" })).then(() => {
        concurrentWriteFinishedFirst = true;
      }),
    );
    await concurrentWrite;
    expect(concurrentWriteFinishedFirst).toBe(true);
    await slowResolve;
  });
});
