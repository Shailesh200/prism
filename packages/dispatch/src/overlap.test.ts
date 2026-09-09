import { describe, expect, it } from "vitest";
import { findPathOverlap, sameWorktreePath } from "./overlap.js";
import type { JobRecord } from "./types.js";

function job(patch: Partial<JobRecord>): JobRecord {
  const now = new Date().toISOString();
  return {
    id: "j1",
    title: "one",
    playbook: "ticket",
    prd: "",
    branch: "main",
    worktreePath: "/tmp/wt",
    source: "prism",
    status: "running",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

describe("sameWorktreePath", () => {
  it("treats resolved aliases as one folder", () => {
    expect(sameWorktreePath("/tmp/wt", "/tmp/wt")).toBe(true);
    expect(sameWorktreePath("/tmp/wt", "/tmp/other")).toBe(false);
    expect(sameWorktreePath("", "/tmp/wt")).toBe(false);
  });
});

describe("findPathOverlap", () => {
  it("matches jobs on the same folder even when the strings differ", async () => {
    const overlap = await findPathOverlap({
      jobs: [job({ worktreePath: "/tmp/wt" })],
      path: "/tmp/wt/.",
      git: async () => ({ ok: true, stdout: " M a.ts\n", stderr: "" }),
    });
    expect(overlap?.existingJobId).toBe("j1");
    expect(overlap?.dirty).toBe(true);
  });

  it("ignores finished jobs", async () => {
    const overlap = await findPathOverlap({
      jobs: [job({ status: "done" })],
      path: "/tmp/wt",
      git: async () => ({ ok: true, stdout: "", stderr: "" }),
    });
    expect(overlap).toBeUndefined();
  });

  it("ignores a failed job that already left the tree", async () => {
    const overlap = await findPathOverlap({
      jobs: [job({ status: "error", title: "audit gsap components" })],
      path: "/tmp/wt",
      git: async () => ({ ok: true, stdout: " M a.ts\n", stderr: "" }),
    });
    expect(overlap).toBeUndefined();
  });

  it("ignores queued and needs_confirm jobs — they have no teammate yet", async () => {
    const overlap = await findPathOverlap({
      jobs: [job({ status: "queued" }), job({ id: "j2", status: "needs_confirm" })],
      path: "/tmp/wt",
      git: async () => ({ ok: true, stdout: "", stderr: "" }),
    });
    expect(overlap).toBeUndefined();
  });
});
