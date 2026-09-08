import { describe, expect, it } from "vitest";
import {
  appendStatusEvent,
  kindForStatus,
  seedLifecycle,
  withLifecycleEvents,
} from "./lifecycle.js";
import type { JobRecord } from "./types.js";

const base = {
  id: "j1",
  title: "Paginate",
  branch: "dispatch/j1",
  worktreePath: "/tmp/wt",
  source: "prism" as const,
  lastStep: "",
  nextStep: "",
  waitingOn: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  queuedAt: "2026-01-01T00:00:02.000Z",
  updatedAt: "2026-01-01T00:00:02.000Z",
  status: "queued" as const,
};

function job(patch: Partial<JobRecord>): JobRecord {
  return { ...base, ...patch } as JobRecord;
}

describe("kindForStatus", () => {
  it("maps pause to a new queued node and stuck to waiting", () => {
    expect(kindForStatus("paused")).toBe("queued");
    expect(kindForStatus("blocked")).toBe("waiting");
    expect(kindForStatus("waiting_on_you")).toBe("waiting");
    expect(kindForStatus("running")).toBe("working");
    expect(kindForStatus("ready")).toBe("working");
    expect(kindForStatus("needs_review")).toBe("review");
  });
});

describe("appendStatusEvent", () => {
  it("does not grow another queued node while the job sits in the queue", () => {
    const seeded = seedLifecycle(job({ status: "queued" }));
    const next = appendStatusEvent(
      seeded,
      job({ status: "queued" }),
      "2026-01-01T00:01:00.000Z",
    );
    expect(next.filter((event) => event.kind === "queued")).toHaveLength(1);
  });

  it("appends queued after working when the job is paused", () => {
    const running = job({
      status: "running",
      startedAt: "2026-01-01T00:09:00.000Z",
      lifecycle: [
        { kind: "accepted", at: "2026-01-01T00:00:00.000Z" },
        { kind: "queued", at: "2026-01-01T00:00:02.000Z" },
        { kind: "working", at: "2026-01-01T00:09:00.000Z" },
      ],
    });
    const paused = withLifecycleEvents(
      running,
      { ...running, status: "paused" },
      "2026-01-01T00:12:00.000Z",
    );
    expect(paused.lifecycle?.map((event) => event.kind)).toEqual([
      "accepted",
      "queued",
      "working",
      "queued",
    ]);
    expect(paused.lifecycle?.at(-1)?.note).toBe("paused");
  });

  it("appends working after a pause instead of rewinding", () => {
    const paused = job({
      status: "paused",
      startedAt: "2026-01-01T00:09:00.000Z",
      lifecycle: [
        { kind: "accepted", at: "2026-01-01T00:00:00.000Z" },
        { kind: "queued", at: "2026-01-01T00:00:02.000Z" },
        { kind: "working", at: "2026-01-01T00:09:00.000Z" },
        { kind: "queued", at: "2026-01-01T00:12:00.000Z", note: "paused" },
      ],
    });
    const resumed = withLifecycleEvents(
      paused,
      { ...paused, status: "running" },
      "2026-01-01T00:13:00.000Z",
    );
    expect(resumed.lifecycle?.map((event) => event.kind)).toEqual([
      "accepted",
      "queued",
      "working",
      "queued",
      "working",
    ]);
    expect(resumed.lifecycle?.at(-1)?.note).toBe("resumed");
  });

  it("appends working when resume lands on ready instead of rewinding", () => {
    const paused = job({
      status: "paused",
      startedAt: "2026-01-01T00:09:00.000Z",
      lifecycle: [
        { kind: "accepted", at: "2026-01-01T00:00:00.000Z" },
        { kind: "queued", at: "2026-01-01T00:00:02.000Z" },
        { kind: "working", at: "2026-01-01T00:09:00.000Z" },
        { kind: "queued", at: "2026-01-01T00:12:00.000Z", note: "paused" },
      ],
    });
    const resumed = withLifecycleEvents(
      paused,
      { ...paused, status: "ready" },
      "2026-01-01T00:13:00.000Z",
    );
    expect(resumed.lifecycle?.map((event) => event.kind)).toEqual([
      "accepted",
      "queued",
      "working",
      "queued",
      "working",
    ]);
  });

  it("appends waiting after working when the job is stuck", () => {
    const running = job({
      status: "running",
      startedAt: "2026-01-01T00:09:00.000Z",
      lifecycle: [
        { kind: "accepted", at: "2026-01-01T00:00:00.000Z" },
        { kind: "queued", at: "2026-01-01T00:00:02.000Z" },
        { kind: "working", at: "2026-01-01T00:09:00.000Z" },
      ],
    });
    const stuck = withLifecycleEvents(
      running,
      { ...running, status: "blocked" },
      "2026-01-01T00:14:00.000Z",
    );
    expect(stuck.lifecycle?.map((event) => event.kind)).toEqual([
      "accepted",
      "queued",
      "working",
      "waiting",
    ]);
  });
});
