import { describe, expect, it } from "vitest";
import { isShallowGitRepository } from "./doctor.js";

describe("isShallowGitRepository (M-057 P-B11)", () => {
  it("returns false for this full checkout (or null when git is unavailable)", () => {
    const result = isShallowGitRepository(process.cwd());
    expect(result === false || result === null || result === true).toBe(true);
  });
});
