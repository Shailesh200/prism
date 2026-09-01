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
    expect(SERVER_INSTRUCTIONS).toContain("start_my_day");
    expect(SERVER_INSTRUCTIONS).toContain("start_job");
    expect(SERVER_INSTRUCTIONS).toContain("init");
    expect(SERVER_INSTRUCTIONS).not.toMatch(/prism_blast_radius/);
  });

  it("maps connect language onto integrations and Authenticate", () => {
    expect(SERVER_INSTRUCTIONS).toContain("integrations");
    expect(SERVER_INSTRUCTIONS).toMatch(/Authenticate/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/google-calendar/);
    expect(SERVER_INSTRUCTIONS).toMatch(/Do not search the repository/);
  });

  it("maps prism init onto init and forbids mcp.json API keys", () => {
    expect(SERVER_INSTRUCTIONS).toContain("init");
    expect(SERVER_INSTRUCTIONS).toMatch(
      /Do not ask the user to paste CURSOR_API_KEY or edit mcp\.json/,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(/speak only each Dispatch tool/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/canonical id/);
    expect(SERVER_INSTRUCTIONS).toMatch(/where are we/);
  });

  it("tells agents never to call mcp_auth and to Skip the Authenticating prism card", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/Never call mcp_auth for Prism/);
    expect(SERVER_INSTRUCTIONS).toMatch(/Authenticating prism/);
    expect(SERVER_INSTRUCTIONS).toMatch(/click Skip/);
  });

  it("maps start my day onto start_my_day as the first tool", () => {
    expect(SERVER_INSTRUCTIONS).toContain("start_my_day as the first tool");
    expect(SERVER_INSTRUCTIONS).toMatch(/return its briefing as written/i);
  });

  it("requires blast_radius before editing unfamiliar code", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/BEFORE editing/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/blast_radius/);
  });

  it("does not attach Prism MCP to Dispatch job workers", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/do not get Prism MCP/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/no bun install/i);
  });

  it("tells agents to pass the open git folder as workspace", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/does not see a git repository/);
    expect(SERVER_INSTRUCTIONS).toMatch(/pass workspace as the absolute path/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/do not put it in mcp\.json/i);
  });

  it("routes on intent rather than a magic phrase", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/never say magic phrases/i);
    expect(SERVER_INSTRUCTIONS).toMatch(
      /Do not wait for “use Prism”, “call repository_health”, or “start working on”/,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(
      /asking about.+or.+asking for work on/is,
    );
  });

  it("announces a job before starting it", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(
      /say in one line what you are about to start/i,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(/the user can stop you/i);
  });

  it("tells agents a finished job is checked and never landed silently", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/typecheck and tests/);
    expect(SERVER_INSTRUCTIONS).toMatch(/no reviewable change/);
    // ADR-0045: checkout jobs stay uncommitted; worktree jobs get a commit.
    expect(SERVER_INSTRUCTIONS).toMatch(/uncommitted/);
    expect(SERVER_INSTRUCTIONS).toMatch(/job branch/);
  });

  it("recognises code changes by intent, not the phrase start working on", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/recognise a code change/i);
    expect(SERVER_INSTRUCTIONS).toMatch(
      /does NOT require the words “start working on”/,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(/ticket id, or a PRD/);
    expect(SERVER_INSTRUCTIONS).toMatch(/do not also do the work inline/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/write the PRD yourself/i);
    // Recognising the work must not itself decide where it runs.
    expect(SERVER_INSTRUCTIONS).toMatch(/settled by the ask rule below/i);
  });

  it("asks teammate-or-inline instead of guessing", () => {
    // Guessing produced both failure modes: a stranded job, and an unwanted
    // edit in a tree the user was mid-work in. Asking costs one line.
    expect(SERVER_INSTRUCTIONS).toMatch(/ask before you change code/i);
    expect(SERVER_INSTRUCTIONS).toMatch(
      /hand this to a background teammate, or do it here/i,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(/dispatchMode=ask/);
    expect(SERVER_INSTRUCTIONS).toMatch(/dispatchMode=auto/);
    expect(SERVER_INSTRUCTIONS).toMatch(/dispatchMode=inline/);
    expect(SERVER_INSTRUCTIONS).toMatch(/never ask twice/i);
  });

  it("still recognises change intent without a magic phrase", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/recognise a code change/i);
    expect(SERVER_INSTRUCTIONS).toMatch(
      /does NOT require the words “start working on”/,
    );
  });

  it("honours an explicit request for a job even for read-only work", () => {
    // Regression: "start working on reviewing the local changes" was answered
    // inline because the rules listed reviews as inline, with no way for the
    // user to override. An explicit ask must win.
    expect(SERVER_INSTRUCTIONS).toMatch(
      /an explicit request beats every rule below/i,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(/even when the task is read-only/i);
    expect(SERVER_INSTRUCTIONS).toMatch(
      /start working on reviewing the local changes/,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(/Precedence, in order/);
  });

  it("reviews through Prism intelligence, not a raw diff read", () => {
    // Observed: an agent asked to review ran `git diff`, read 1129 lines with a
    // generic code-review skill, and never called Prism at all.
    expect(SERVER_INSTRUCTIONS).toMatch(/Never review from a raw git diff/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/review_changes already carries/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/repository_dna or stack_profile/);
    expect(SERVER_INSTRUCTIONS).toMatch(/which findings came from Prism/i);
  });

  it("keeps an inline escape hatch that beats the dispatch signal", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/Do NOT dispatch/);
    expect(SERVER_INSTRUCTIONS).toMatch(/do it now/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/don't dispatch/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/when the user says to do it here/i);
  });

  it("routes repo-wide audit to repository_health, not start_job", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/find issues/i);
    expect(SERVER_INSTRUCTIONS).toMatch(
      /Do not start_job for a repo-wide scan/,
    );
  });

  it("points where-are-we at the jobs dashboard when the message includes a URL", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/jobs dashboard URL/);
  });

  it("treats the Google unverified-app screen as expected", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/Google hasn’t verified this app/);
    expect(SERVER_INSTRUCTIONS).toMatch(/click Advanced/i);
  });

  it("shares Dispatch configure across Cursor, Claude Code, and Codex", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/Cursor, Claude Code, Codex/);
  });
});

describe("prompt catalogue", () => {
  it("exposes the three workflow prompts", () => {
    expect([...PROMPT_NAMES].sort()).toEqual(
      [
        "before_edit",
        "configure",
        "connect",
        "init",
        "orient",
        "review_diff",
        "start_my_day",
        "start_work",
        "where_are_we",
      ].sort(),
    );
  });
});
