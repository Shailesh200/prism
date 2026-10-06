import { describe, expect, it } from "vitest";
import { PROMPT_NAMES, SERVER_INSTRUCTIONS } from "./instructions.js";

describe("server instructions (safety layer)", () => {
  it("tells agents users never name tools", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/users never name tools/i);
    expect(SERVER_INSTRUCTIONS).not.toMatch(/prism_blast_radius/);
  });

  it("routes a change through prepare, blast, guard, and the receipt", () => {
    expect(SERVER_INSTRUCTIONS).toContain("repository_overview");
    expect(SERVER_INSTRUCTIONS).toContain("prepare_change");
    expect(SERVER_INSTRUCTIONS).toMatch(/BEFORE editing/i);
    expect(SERVER_INSTRUCTIONS).toContain("blast_radius");
    expect(SERVER_INSTRUCTIONS).toContain("guard_session");
    expect(SERVER_INSTRUCTIONS).toContain("guard_session");
    expect(SERVER_INSTRUCTIONS).toMatch(/Never review from a raw git diff/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/never invent dependents/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/prism-review-pr skill/);
    expect(SERVER_INSTRUCTIONS).toMatch(/change receipt/i);
  });

  it("reviews through lenses and does not run a background agent", () => {
    expect(SERVER_INSTRUCTIONS).toContain("review_with");
    expect(SERVER_INSTRUCTIONS).toMatch(/architect, qa, dev/);
    expect(SERVER_INSTRUCTIONS).toMatch(/does not run a background agent/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/do this in this chat/i);
    expect(SERVER_INSTRUCTIONS).not.toMatch(
      /hand this to a background teammate/,
    );
  });

  it("keeps a finding open until a re-scan", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(
      /stays open until Prism re-runs that report/,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(
      /never call it fixed because you edited something/,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(
      /If the user asks to fix one, call queue_finding/,
    );
  });

  it("sends credentials to the host, not to a Prism OAuth flow", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/does not run its own OAuth/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/Never call mcp_auth for Prism/);
  });

  it("treats inferred graph edges as not load-bearing", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(
      /inferred graph edges are not load-bearing/i,
    );
  });
});

describe("prompt catalogue", () => {
  it("exposes the review and orientation prompts, and no job-runner prompts", () => {
    expect([...PROMPT_NAMES].sort()).toEqual(
      ["before_edit", "orient", "review_diff", "review_lenses"].sort(),
    );
  });
});
