import { describe, expect, it } from "vitest";
import {
  claudeCliCommand,
  claudeGrandchildEnv,
  claudeWorkerArgs,
} from "./claude-cli.js";

describe("claudeWorkerArgs", () => {
  it("pins the ADR-0041 contract: bare, no shell, no MCP, stream-json", () => {
    const args = claudeWorkerArgs({});
    expect(args).toContain("-p");
    expect(args).toContain("--bare");
    expect(args.join(" ")).toContain("--output-format stream-json");
    expect(args.join(" ")).toContain("--permission-mode acceptEdits");
    const tools = args[args.indexOf("--tools") + 1] ?? "";
    expect(tools.split(",")).toEqual([
      "Read",
      "Edit",
      "Write",
      "Grep",
      "Glob",
      "LS",
    ]);
    // No shell, no MCP tools — repeated flags for commander variadic parsing.
    expect(args).toContain("--disallowedTools");
    expect(args).toContain("Bash");
    expect(args).toContain("mcp__*");
    expect(args).not.toContain("--resume");
  });

  it("adds Task only when subagents are on (ADR-0042 §4)", () => {
    const withSub = claudeWorkerArgs({ subagents: true });
    const tools = withSub[withSub.indexOf("--tools") + 1] ?? "";
    expect(tools.split(",")).toContain("Task");
    expect(withSub).toContain("--forward-subagent-text");
    const without = claudeWorkerArgs({ subagents: false });
    expect(without[without.indexOf("--tools") + 1]).not.toContain("Task");
    expect(without).not.toContain("--forward-subagent-text");
  });

  it("resumes a session by id", () => {
    const args = claudeWorkerArgs({ resumeSessionId: "sess-123" });
    const at = args.indexOf("--resume");
    expect(args[at + 1]).toBe("sess-123");
  });
});

describe("claudeGrandchildEnv", () => {
  it("strips nesting guards but keeps deliberate auth env", () => {
    const env = claudeGrandchildEnv({
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_SSE_PORT: "1234",
      CLAUDE_CODE_OAUTH_TOKEN: "keep-me",
      ANTHROPIC_API_KEY: "keep-me-too",
      PATH: "/usr/bin",
    });
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
    expect(env.CLAUDE_CODE_SSE_PORT).toBeUndefined();
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("keep-me");
    expect(env.ANTHROPIC_API_KEY).toBe("keep-me-too");
    expect(env.PATH).toBe("/usr/bin");
  });
});

describe("claudeCliCommand", () => {
  it("uses the .cmd shim through a shell on Windows only", () => {
    expect(claudeCliCommand("darwin")).toEqual({
      command: "claude",
      shell: false,
    });
    expect(claudeCliCommand("win32")).toEqual({
      command: "claude.cmd",
      shell: true,
    });
  });
});
