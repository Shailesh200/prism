import { describe, expect, it } from "vitest";
import { SKILL_PLAYBOOK, isSkillPlaybook } from "./playbook.js";

describe("skill playbook", () => {
  it("identifies the Skills compose playbook only", () => {
    expect(SKILL_PLAYBOOK).toBe("skill");
    expect(isSkillPlaybook("skill")).toBe(true);
    expect(isSkillPlaybook("console")).toBe(false);
    expect(isSkillPlaybook(undefined)).toBe(false);
  });
});
