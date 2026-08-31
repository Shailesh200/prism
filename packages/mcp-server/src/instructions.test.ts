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

  it("routes repo-wide audit to repository_health, not start_job", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/find issues/i);
    expect(SERVER_INSTRUCTIONS).toMatch(
      /Do not start_job for a repo-wide scan/,
    );
  });

  it("treats the Google unverified-app screen as expected", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/Google hasn’t verified this app/);
    expect(SERVER_INSTRUCTIONS).toMatch(/click Advanced/i);
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
