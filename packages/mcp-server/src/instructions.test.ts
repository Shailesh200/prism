import { describe, expect, it } from "vitest";
import { DEFAULT_TOOL_NAMES } from "./tools.js";
import { PROMPT_NAMES, SERVER_INSTRUCTIONS } from "./instructions.js";

describe("server instructions (M-091)", () => {
  it("stays under 1.5 KB", () => {
    expect(Buffer.byteLength(SERVER_INSTRUCTIONS, "utf8")).toBeLessThanOrEqual(
      1536,
    );
  });

  it("routes a change through prepare, blast, guard and the stop verdict", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/users never name these tools/i);
    expect(SERVER_INSTRUCTIONS).toContain("prepare_change");
    expect(SERVER_INSTRUCTIONS).toMatch(/Before editing/);
    expect(SERVER_INSTRUCTIONS).toContain("blast_radius");
    expect(SERVER_INSTRUCTIONS).toContain("guard_session");
    expect(SERVER_INSTRUCTIONS).toMatch(/do not invent dependents/i);
    // Plan §5.7 verdicts. The bare word "receipt" is a tool name (opt-in), so
    // the default instructions describe the verdict without naming it.
    expect(SERVER_INSTRUCTIONS).toMatch(
      /verdict on your change: proven, not proven \(with the reason\) or failed/,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(/inferred edges are hints/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/Never call mcp_auth for Prism/);
  });

  it("names only default tools and nothing about jobs", () => {
    const named = [...SERVER_INSTRUCTIONS.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)]
      .map((match) => match[0])
      .filter((word) => word !== "mcp_auth");
    const visible = new Set<string>(DEFAULT_TOOL_NAMES);
    expect(named.filter((name) => !visible.has(name))).toEqual([]);
    expect(SERVER_INSTRUCTIONS).not.toMatch(
      /start_job|queue_finding|wake|sleep|teammate|review_with|dispatch/i,
    );
  });
});

describe("prompt catalogue", () => {
  it("exposes the orientation and review prompts, and no job-runner prompts", () => {
    expect([...PROMPT_NAMES].sort()).toEqual(
      ["before_edit", "orient", "review_diff"].sort(),
    );
  });
});
