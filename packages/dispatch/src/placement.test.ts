import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveConfig } from "./config.js";
import { createDispatchRuntime } from "./runtime.js";
import { upsertJob } from "./jobs.js";
import {
  defaultGitRunner,
  gitCheckoutReview,
  gitDirtyPaths,
  unexpectedDirtyPaths,
} from "./git.js";
import { completeWorkerRun } from "./worker-finish.js";
import { reviewSpeak } from "./job-voice.js";
import type { GitRunner } from "./git.js";
import type { WorkerPort } from "./worker.js";
import type { JobRecord, JobReview } from "./types.js";
import type { RunState } from "./run-state.js";

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "prism-dispatch-placement-"));
}

/** A clean-tree git mock; tests override per-command as needed. */
function makeGit(overrides: Record<string, string> = {}): GitRunner {
  return async (_cwd, args) => {
    const key = args.join(" ");
    for (const [match, stdout] of Object.entries(overrides)) {
      if (key.startsWith(match)) return { ok: true, stdout, stderr: "" };
    }
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
      return { ok: true, stdout: "main\n", stderr: "" };
    }
    return { ok: true, stdout: "", stderr: "" };
  };
}

type Seen = {
  calls: string[];
  cwd: string | undefined;
  placement: string | undefined;
  preExisting: readonly string[] | undefined;
  prompt: string | undefined;
};

function makeSeen(): Seen {
  return {
    calls: [],
    cwd: undefined,
    placement: undefined,
    preExisting: undefined,
    prompt: undefined,
  };
}

function capturingWorker(seen: Seen): WorkerPort {
  return {
    async start(input) {
      seen.calls.push(`start:${input.jobId}`);
      seen.cwd = input.cwd;
      seen.placement = input.placement;
      seen.preExisting = input.preExistingChanges;
      seen.prompt = input.prompt;
      return { pid: 99_999_999 };
    },
    async resume(input) {
      seen.calls.push(`resume:${input.jobId}`);
      seen.preExisting = input.preExistingChanges;
      return { pid: 99_999_999 };
    },
    async cancel() {},
    async status() {
      return { status: "running", detail: "" };
    },
  };
}

function baseJob(patch: Partial<JobRecord>): JobRecord {
  const now = new Date().toISOString();
  return {
    id: "j1",
    title: "job one",
    playbook: "ticket",
    prd: "",
    branch: "main",
    worktreePath: "",
    source: "checkout",
    status: "running",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

describe("checkout-first placement (ADR-0045)", () => {
  it("defaults to the user's checkout: no worktree, no commit machinery", async () => {
    root = await tempRoot();
    const seen = makeSeen();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit(),
      worker: capturingWorker(seen),
      env: { CURSOR_API_KEY: "k" },
    });
    const result = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    })) as { job: JobRecord; message: string };
    expect(result.job.placement).toBe("checkout");
    expect(result.job.source).toBe("checkout");
    expect(result.job.worktreePath).toBe(root);
    expect(result.job.branch).toBe("main");
    expect(seen.cwd).toBe(root);
    expect(seen.placement).toBe("checkout");
    expect(seen.prompt).toContain("user's own working tree");
    expect(seen.prompt).toContain("Prism never commits");
    expect(result.message).toMatch(/working tree/i);
    expect(result.message).not.toMatch(/worktree/i);
  });

  it("asks before joining a dirty tree, then snapshots the dirty paths", async () => {
    root = await tempRoot();
    const seen = makeSeen();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit({ "status --porcelain": " M src/app.ts\n?? notes.txt\n" }),
      worker: capturingWorker(seen),
      env: { CURSOR_API_KEY: "k" },
    });
    const first = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    })) as { needsConfirm?: boolean; message: string; job?: JobRecord };
    expect(first.needsConfirm).toBe(true);
    expect(first.message).toMatch(/work alongside/i);
    expect(first.job).toBeUndefined();
    expect(seen.calls).toEqual([]);

    const confirmed = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
      confirmDirty: true,
    })) as { job: JobRecord };
    expect(confirmed.job.placement).toBe("checkout");
    expect(confirmed.job.preExistingChanges).toEqual([
      "notes.txt",
      "src/app.ts",
    ]);
    expect(seen.preExisting).toEqual(["notes.txt", "src/app.ts"]);
  });

  it("honours an explicit worktree ask", async () => {
    root = await tempRoot();
    const seen = makeSeen();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit(),
      worker: capturingWorker(seen),
      env: { CURSOR_API_KEY: "k" },
    });
    const result = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
      placement: "worktree",
    })) as { job: JobRecord };
    expect(result.job.placement).toBe("worktree");
    expect(result.job.source).not.toBe("checkout");
    expect(seen.placement).toBe("worktree");
  });

  it("lets configure restore worktree-first", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
    const seen = makeSeen();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit(),
      worker: capturingWorker(seen),
      env: { CURSOR_API_KEY: "k" },
    });
    const result = (await runtime.handle("start_job", {
      title: "fix login",
      jobId: "fix-login",
    })) as { job: JobRecord };
    expect(result.job.placement).toBe("worktree");
  });

  it("moves a concurrent second job to a worktree and says why", async () => {
    root = await tempRoot();
    // A live checkout job occupying the user's tree.
    await upsertJob(
      root,
      baseJob({
        id: "busy-one",
        placement: "checkout",
        worktreePath: root,
        workerPid: process.pid, // the test process is alive
      }),
    );
    const seen = makeSeen();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit(),
      worker: capturingWorker(seen),
      env: { CURSOR_API_KEY: "k" },
    });
    const result = (await runtime.handle("start_job", {
      title: "second job",
      jobId: "second-job",
    })) as { job: JobRecord; message: string };
    expect(result.job.placement).toBe("worktree");
    expect(result.message).toMatch(/already has a teammate/i);
  });

  it("commit stages only the job's files, on the current branch", async () => {
    root = await tempRoot();
    const added: string[][] = [];
    const committed: string[] = [];
    const gitRunner: GitRunner = async (cwd, args) => {
      if (args[0] === "add") {
        added.push(args.slice(1));
        return { ok: true, stdout: "", stderr: "" };
      }
      if (args[0] === "diff" && args[1] === "--cached") {
        return { ok: true, stdout: "src/login.ts\n", stderr: "" };
      }
      if (args.includes("commit")) {
        committed.push(args.join(" "));
        return { ok: true, stdout: "", stderr: "" };
      }
      if (args[0] === "show") {
        return {
          ok: true,
          stdout:
            " src/login.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n",
          stderr: "",
        };
      }
      if (args[0] === "rev-parse") {
        return { ok: true, stdout: "abc1234\n", stderr: "" };
      }
      return makeGit()(cwd, args);
    };
    const review: JobReview = {
      files: [
        { path: "src/login.ts", added: 1, removed: 1, change: "modified" },
      ],
      totalAdded: 1,
      totalRemoved: 1,
      truncated: false,
      branch: "main",
      baseRef: "HEAD",
      committed: false,
      merged: false,
      mixedPaths: [],
    };
    await upsertJob(
      root,
      baseJob({
        id: "fix-login",
        placement: "checkout",
        worktreePath: root,
        status: "needs_review",
        review,
      }),
    );
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: gitRunner,
      env: {},
    });
    const result = (await runtime.handle("job_control", {
      jobId: "fix-login",
      action: "commit",
    })) as { job: JobRecord; message: string };
    expect(result.job.status).toBe("done");
    expect(result.job.commitSha).toBe("abc1234");
    // Only the job's files plus the artifact allowlist — never -A.
    const pathAdds = added.filter((args) => !args.includes("-f"));
    expect(pathAdds).toEqual([["--", "src/login.ts"]]);
    expect(committed.join(" ")).toContain("dispatch(fix-login): job one");
    expect(result.message).toMatch(/only the job's files/i);
  });

  it("snapshots dirty paths on pause so resume can tell new files apart", async () => {
    root = await tempRoot();
    await upsertJob(
      root,
      baseJob({
        id: "fix-login",
        title: "fix login",
        placement: "checkout",
        worktreePath: root,
        status: "running",
        preExistingChanges: ["src/app.ts"],
      }),
    );
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit({
        "status --porcelain": " M src/app.ts\n M src/job.ts\n",
      }),
      worker: capturingWorker(makeSeen()),
      env: { CURSOR_API_KEY: "k" },
    });
    const paused = (await runtime.handle("job_control", {
      jobId: "fix-login",
      action: "pause",
    })) as { job: JobRecord; message: string };
    expect(paused.job.status).toBe("paused");
    expect(paused.job.knownDirtyPaths).toEqual(["src/app.ts", "src/job.ts"]);
    expect(paused.message).toMatch(/paused/i);
    expect(paused.message).not.toMatch(/cancelled/i);
  });

  it("asks before resuming a checkout job into files it has not seen", async () => {
    root = await tempRoot();
    const seen = makeSeen();
    await upsertJob(
      root,
      baseJob({
        id: "fix-login",
        title: "fix login",
        placement: "checkout",
        worktreePath: root,
        status: "paused",
        preExistingChanges: ["src/app.ts"],
        knownDirtyPaths: ["src/app.ts", "src/job.ts"],
      }),
    );
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit({
        "status --porcelain": " M src/app.ts\n M src/job.ts\n?? extra.ts\n",
      }),
      worker: capturingWorker(seen),
      env: { CURSOR_API_KEY: "k" },
    });
    const first = (await runtime.handle("job_control", {
      jobId: "fix-login",
      action: "resume",
    })) as { needsConfirm?: boolean; message: string; job?: JobRecord };
    expect(first.needsConfirm).toBe(true);
    expect(first.message).toMatch(/has not seen yet/i);
    expect(seen.calls).toEqual([]);

    const confirmed = (await runtime.handle("job_control", {
      jobId: "fix-login",
      action: "resume",
      confirmDirty: true,
    })) as { job: JobRecord };
    expect(confirmed.job.status).toBe("running");
    expect(confirmed.job.preExistingChanges).toEqual([
      "extra.ts",
      "src/app.ts",
    ]);
    expect(seen.calls).toEqual(["start:fix-login"]);
  });

  it("resumes a checkout job without asking when dirty paths were already known", async () => {
    root = await tempRoot();
    const seen = makeSeen();
    await upsertJob(
      root,
      baseJob({
        id: "fix-login",
        title: "fix login",
        placement: "checkout",
        worktreePath: root,
        status: "paused",
        preExistingChanges: ["src/app.ts"],
        knownDirtyPaths: ["src/app.ts", "src/job.ts"],
      }),
    );
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit({
        "status --porcelain": " M src/app.ts\n M src/job.ts\n",
      }),
      worker: capturingWorker(seen),
      env: { CURSOR_API_KEY: "k" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "fix-login",
      action: "resume",
    })) as { job: JobRecord; needsConfirm?: boolean };
    expect(result.needsConfirm).toBeUndefined();
    expect(result.job.status).toBe("running");
    expect(seen.calls).toEqual(["start:fix-login"]);
  });

  it("refuses to commit a worktree job (it is already committed)", async () => {
    root = await tempRoot();
    await upsertJob(
      root,
      baseJob({
        id: "wt-job",
        placement: "worktree",
        source: "prism",
        worktreePath: "/tmp/wt",
        status: "needs_review",
      }),
    );
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: makeGit(),
      env: {},
    });
    const result = (await runtime.handle("job_control", {
      jobId: "wt-job",
      action: "commit",
    })) as { message: string };
    expect(result.message).toMatch(/already committed/i);
  });
});

describe("gitCheckoutReview", () => {
  it("subtracts pre-existing paths and flags mixed files", async () => {
    const git = makeGit({
      "diff --numstat HEAD": "10\t2\tsrc/job.ts\n5\t1\tsrc/app.ts\n",
      "status --porcelain":
        " M src/job.ts\n M src/app.ts\n?? src/new-file.ts\n",
    });
    const review = await gitCheckoutReview(
      "/tmp/x",
      {
        preExisting: ["src/app.ts"],
        branch: "main",
      },
      git,
    );
    expect(review.files.map((file) => file.path)).toEqual([
      "src/job.ts",
      "src/new-file.ts",
    ]);
    expect(review.files[0]).toMatchObject({
      added: 10,
      removed: 2,
      change: "modified",
    });
    expect(review.files[1]).toMatchObject({ change: "untracked" });
    expect(review.mixedPaths).toEqual(["src/app.ts"]);
    expect(review.committed).toBe(false);
    expect(review.merged).toBe(false);
  });

  it("is empty when nothing changed", async () => {
    const review = await gitCheckoutReview("/tmp/x", { preExisting: [] });
    expect(review.files).toEqual([]);
  });
});

describe("gitDirtyPaths", () => {
  it("lists porcelain paths without noise", async () => {
    const git = makeGit({
      "status --porcelain":
        " M src/app.ts\n?? .prism/cache/x\n M node_modules/pkg/y\n",
    });
    expect(await gitDirtyPaths("/tmp/x", git)).toEqual(["src/app.ts"]);
  });
});

describe("unexpectedDirtyPaths", () => {
  it("subtracts dispatch, pause, and review paths", () => {
    expect(
      unexpectedDirtyPaths(
        {
          preExistingChanges: ["src/app.ts"],
          knownDirtyPaths: ["src/app.ts", "src/job.ts"],
          review: {
            files: [{ path: "src/new.ts" }],
          },
        },
        ["src/app.ts", "src/job.ts", "src/new.ts", "extra.ts"],
      ),
    ).toEqual(["extra.ts"]);
  });
});

describe("reviewSpeak checkout voice", () => {
  it("says uncommitted and offers to commit just those files", () => {
    const text = reviewSpeak(
      { id: "fix-login", title: "fix login" },
      {
        files: [
          { path: "src/login.ts", added: 3, removed: 1, change: "modified" },
        ],
        totalAdded: 3,
        totalRemoved: 1,
        truncated: false,
        branch: "main",
        baseRef: "HEAD",
        committed: false,
        merged: false,
        mixedPaths: ["src/app.ts"],
      },
    );
    expect(text).toContain("in your working tree");
    expect(text).toContain("uncommitted");
    expect(text).toContain("commit it");
    expect(text).toContain("src/app.ts");
    expect(text).not.toMatch(/its own branch/i);
  });
});

describe("completeWorkerRun checkout finish", { timeout: 30_000 }, () => {
  it("leaves the edits uncommitted and reviews only the job's files", async () => {
    // A real repo: the user's checkout with one file already dirty.
    const dir = await mkdtemp(join(tmpdir(), "prism-checkout-finish-"));
    try {
      const run = defaultGitRunner;
      await run(dir, ["init", "-b", "main"]);
      await run(dir, ["config", "user.email", "t@example.com"]);
      await run(dir, ["config", "user.name", "Test"]);
      await writeFile(join(dir, ".gitignore"), ".prism/\nnode_modules\n");
      await writeFile(join(dir, "app.ts"), "const a = 1;\n");
      await writeFile(join(dir, "mine.ts"), "mine\n");
      await run(dir, ["add", "-A"]);
      await run(dir, ["commit", "-m", "seed"]);
      const headBefore = await run(dir, ["rev-parse", "HEAD"]);

      // The user's own uncommitted change, present before dispatch.
      await writeFile(join(dir, "mine.ts"), "mine, edited by the user\n");
      // The job's edits.
      await writeFile(join(dir, "app.ts"), "const a = 2;\n");
      await writeFile(join(dir, "new.ts"), "fresh\n");

      const patches: Partial<RunState>[] = [];
      await completeWorkerRun(
        {
          jobId: "fix-login",
          cwd: dir,
          workspaceRoot: dir,
          title: "fix login",
          placement: "checkout",
          preExistingChanges: ["mine.ts"],
          verify: false,
        },
        "Updated app.ts and added new.ts.",
        {
          patch: async (partial) => {
            patches.push(partial);
          },
          logLine: async () => {},
        },
      );

      const headAfter = await run(dir, ["rev-parse", "HEAD"]);
      // No commit: HEAD is untouched, and the tree still holds the edits.
      expect(headAfter.stdout).toBe(headBefore.stdout);
      const status = await run(dir, ["status", "--porcelain"]);
      expect(status.stdout).toContain("app.ts");
      expect(status.stdout).toContain("new.ts");
      expect(status.stdout).toContain("mine.ts");

      const done = [...patches].reverse().find((p) => p.phase === "done");
      expect(done).toBeDefined();
      expect(done?.review?.committed).toBe(false);
      expect(
        done?.review?.files.map((file: { path: string }) => file.path),
      ).toEqual(["app.ts", "new.ts"]);
      expect(done?.verification).toBe("skipped");
      expect(done?.resultSummary).toContain("uncommitted");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
