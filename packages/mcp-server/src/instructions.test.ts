import { describe, expect, it } from "vitest";
import { PROMPT_NAMES, SERVER_INSTRUCTIONS } from "./instructions.js";

describe("server instructions (agent auto-use)", () => {
  it("tells agents users never name tools", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/users never name tools/i);
  });

  it("maps ordinary intents to real tool names (no prism_ prefix)", () => {
    expect(SERVER_INSTRUCTIONS).toContain("repository_health");
    expect(SERVER_INSTRUCTIONS).toContain("repository_dna");
    expect(SERVER_INSTRUCTIONS).toContain("blast_radius");
    expect(SERVER_INSTRUCTIONS).toContain("safe_delete");
    expect(SERVER_INSTRUCTIONS).toContain("review_changes");
    expect(SERVER_INSTRUCTIONS).not.toMatch(/prism_blast_radius/);
  });

  it("requires blast_radius before editing unfamiliar code", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/BEFORE editing/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/blast_radius/);
  });
});

describe("prompt catalogue", () => {
  it("exposes the three workflow prompts", () => {
    expect([...PROMPT_NAMES].sort()).toEqual(
      ["before_edit", "orient", "review_diff"].sort(),
    );
  });
});
