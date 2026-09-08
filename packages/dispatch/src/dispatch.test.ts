import { describe, expect, it } from "vitest";
import { visibleDispatchTools, WORKER_HIDDEN_TOOLS } from "./runtime.js";
import { workerPrompt, verificationFixExtra } from "./worker.js";
import type { JobRecord } from "./types.js";

describe("worker tool filter", () => {
  it("omits start_job and start_my_day when PRISM_DISPATCH_ROLE=worker", () => {
    const names = visibleDispatchTools({ PRISM_DISPATCH_ROLE: "worker" });
    expect(names).not.toContain("start_job");
    expect(names).not.toContain("start_my_day");
    expect(names).not.toContain("init");
    expect(names).not.toContain("sleep");
    expect(names).not.toContain("wake");
    expect(WORKER_HIDDEN_TOOLS).toEqual([
      "start_my_day",
      "init",
      "sleep",
      "wake",
      "start_job",
    ]);
    expect(names).toContain("list_jobs");
    expect(names).toContain("remember");
  });

  it("exposes the full pack on the host", () => {
    expect(visibleDispatchTools({}).length).toBe(11);
  });

  it("lets a worker read its own console but not spawn work", () => {
    const names = visibleDispatchTools({ PRISM_DISPATCH_ROLE: "worker" });
    expect(names).toContain("job_logs");
    expect(names).not.toContain("start_job");
  });
});

describe("worker prompt", () => {
  it("tells the worker not to install or recurse", () => {
    const job: JobRecord = {
      id: "J1",
      title: "Fix auth",
      playbook: "ticket",
      prd: "Do not leak tokens",
      branch: "feat/j1",
      worktreePath: "/tmp/j1",
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: "t",
      updatedAt: "t",
    };
    const text = workerPrompt({
      job,
      memories: [
        {
          id: "m",
          scope: "repo",
          text: "Prefer existing auth helpers",
          source: "user",
          createdAt: "t",
        },
      ],
    });
    expect(text).toContain("bun install");
    expect(text).toContain("no shell");
    expect(text).toContain("Finish as soon as the brief is done");
    expect(text).toContain("Do not start new Dispatch jobs");
    expect(text).toContain("change nothing");
    expect(text).toContain("Prefer existing auth helpers");
  });

  it("injects standing job instructions ahead of the PRD", () => {
    const job: JobRecord = {
      id: "J1",
      title: "Fix auth",
      playbook: "ticket",
      prd: "Do not leak tokens",
      branch: "feat/j1",
      worktreePath: "/tmp/j1",
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: "t",
      updatedAt: "t",
    };
    const text = workerPrompt({
      job,
      memories: [],
      jobInstructions: "Prefer small diffs.\nAsk before renaming public APIs.",
    });
    expect(text).toContain("Standing job instructions from the user:");
    expect(text).toContain("Prefer small diffs.");
    expect(text.indexOf("Prefer small diffs.")).toBeLessThan(
      text.indexOf("Do not leak tokens"),
    );
  });

  it("puts a failed-check brief ahead of the original PRD", () => {
    const job: JobRecord = {
      id: "J1",
      title: "Fix auth",
      playbook: "ticket",
      prd: "Do not leak tokens",
      branch: "feat/j1",
      worktreePath: "/tmp/j1",
      source: "prism",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: "t",
      updatedAt: "t",
    };
    const text = workerPrompt({
      job,
      memories: [],
      extra: verificationFixExtra("typecheck failed — error TS2345"),
    });
    expect(text).toContain("Your only job is to make typecheck and tests pass");
    expect(text).toContain("typecheck failed — error TS2345");
    expect(text.indexOf("typecheck failed")).toBeLessThan(
      text.indexOf("Do not leak tokens"),
    );
  });
});
