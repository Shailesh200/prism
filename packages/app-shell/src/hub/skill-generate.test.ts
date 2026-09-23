import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  GENERATE_STEPS,
  generateStepFlags,
  generateElapsedFrom,
  isFinishedSkillJob,
  isPendingSkillGenerate,
  isSkillGenerateJob,
  latestFinishedSkillJob,
  PENDING_GENERATE,
  shouldCancelArrivingSkillJob,
  skillGenerateStage,
  skillJobCoversPending,
  skillJobTitle,
} from "./skill-generate.js";

describe("skill generate chip", () => {
  it("maps worker activity onto Thinking, Writing, Finalising", () => {
    expect(skillGenerateStage({ status: "queued" }).stage).toBe("Thinking");
    expect(skillGenerateStage({ status: "needs_confirm" }).stage).toBe(
      "Waiting",
    );
    expect(skillGenerateStage({ status: "booting" }).stage).toBe("Thinking");
    expect(
      skillGenerateStage({ status: "running", lastActivity: "Thinking" }).stage,
    ).toBe("Thinking");
    expect(
      skillGenerateStage({
        status: "running",
        lastActivity: "Editing files",
      }).stage,
    ).toBe("Writing");
    expect(
      skillGenerateStage({
        status: "running",
        lastActivity: "Running checks…",
      }).stage,
    ).toBe("Finalising");
    expect(skillGenerateStage({ status: "done" }).stage).toBe("Done");
  });

  it("maps the chip onto four hops, with Done filling the rail", () => {
    expect(GENERATE_STEPS).toEqual([
      "Waiting",
      "Thinking",
      "Writing",
      "Finalising",
    ]);
    expect(generateStepFlags("Waiting").index).toBe(0);
    expect(generateStepFlags("Writing")).toEqual({
      index: 2,
      done: false,
      failed: false,
    });
    expect(generateStepFlags("Done")).toEqual({
      index: 3,
      done: true,
      failed: false,
    });
    expect(generateStepFlags("Failed").failed).toBe(true);
    expect(shouldCancelArrivingSkillJob("commitpush", "commitpush")).toBe(true);
    expect(shouldCancelArrivingSkillJob("other", "commitpush")).toBe(false);
  });

  it("matches a live Skill: job by title", () => {
    expect(skillJobTitle("commitpush")).toBe("Skill: commitpush");
    expect(
      isSkillGenerateJob(
        { title: "Skill: commitpush", status: "running" },
        "commitpush",
      ),
    ).toBe(true);
    expect(
      isSkillGenerateJob(
        { title: "Skill: commitpush", status: "needs_confirm" },
        "commitpush",
      ),
    ).toBe(true);
    expect(
      isSkillGenerateJob(
        { title: "Skill: commitpush", status: "done" },
        "commitpush",
      ),
    ).toBe(false);
    expect(isPendingSkillGenerate("Skill: commitpush", "commitpush")).toBe(
      true,
    );
    expect(isPendingSkillGenerate("New job", "commitpush")).toBe(false);
    expect(PENDING_GENERATE.stage).toBe("Waiting");
  });

  it("treats a finished Skill: job as applyable", () => {
    expect(
      isFinishedSkillJob(
        { title: "Skill: commitpush", status: "done" },
        "commitpush",
      ),
    ).toBe(true);
    expect(
      latestFinishedSkillJob(
        [
          {
            title: "Skill: commitpush",
            status: "done",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            title: "Skill: commitpush",
            status: "done",
            updatedAt: "2026-01-01T01:00:00.000Z",
          },
        ],
        "commitpush",
      )?.updatedAt,
    ).toBe("2026-01-01T01:00:00.000Z");
  });

  it("keeps elapsed time on the queue stamp, not startedAt", () => {
    expect(
      generateElapsedFrom({
        queuedAt: "2026-01-01T00:00:00.000Z",
        startedAt: "2026-01-01T00:02:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("2026-01-01T00:00:00.000Z");
  });

  it("drops the pending Waiting chip once this generate's job exists", () => {
    expect(
      skillJobCoversPending(
        {
          title: "Skill: commitpush",
          status: "done",
          queuedAt: "2026-01-01T00:01:00.000Z",
        },
        "commitpush",
        "2026-01-01T00:00:55.000Z",
      ),
    ).toBe(true);
    expect(
      skillJobCoversPending(
        {
          title: "Skill: commitpush",
          status: "done",
          queuedAt: "2025-12-01T00:00:00.000Z",
        },
        "commitpush",
        "2026-01-01T00:00:55.000Z",
      ),
    ).toBe(false);
    expect(
      isSkillGenerateJob(
        { title: "Skill: commitpush", status: "needs_review" },
        "commitpush",
      ),
    ).toBe(true);
  });

  it("formats elapsed as m:ss", () => {
    expect(
      formatElapsed(
        "2026-01-01T00:00:00.000Z",
        Date.parse("2026-01-01T00:00:42.000Z"),
      ),
    ).toBe("0:42");
  });
});
