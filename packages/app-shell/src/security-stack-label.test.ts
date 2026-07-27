import { describe, expect, it } from "vitest";
import { securityStackLabel } from "./security-stack-label.js";

describe("securityStackLabel", () => {
  it("labels Next/React frontend", () => {
    expect(
      securityStackLabel("frontend", ["frontend-next", "frontend-react"]),
    ).toBe("Next/React Frontend");
  });

  it("labels Next server for backend when Next is present", () => {
    expect(securityStackLabel("backend", ["frontend-next"])).toBe(
      "Next server",
    );
  });

  it("falls back to General when domain missing", () => {
    expect(securityStackLabel(undefined, [])).toBe("General");
  });

  it("labels Express backend", () => {
    expect(securityStackLabel("backend", ["backend-express"])).toBe(
      "Express Backend",
    );
  });
});
