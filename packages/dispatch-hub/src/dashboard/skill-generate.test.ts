import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  isSkillGenerateJob,
  skillGenerateStage,
  skillJobTitle,
} from "./skill-generate.js";

describe("skill generate chip", () => {
  it("maps worker activity onto Thinking, Writing, Finalising", () => {
    expect(skillGenerateStage({ status: "queued" }).stage).toBe("Thinking");
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
        { title: "Skill: commitpush", status: "done" },
        "commitpush",
      ),
    ).toBe(false);
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
