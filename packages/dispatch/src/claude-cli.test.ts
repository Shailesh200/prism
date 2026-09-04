import { describe, expect, it } from "vitest";
import {
  claudeCliCommand,
  claudeGrandchildEnv,
  claudeWorkerArgs,
  isOptionalClaudeFlag,
  OPTIONAL_CLAUDE_FLAGS,
  unknownOptionFrom,
  withoutClaudeFlag,
} from "./claude-cli.js";
import { publicWorkerError } from "./job-voice.js";
import { WORKER_INTELLIGENCE_TOOLS } from "./worker-options.js";

describe("claudeWorkerArgs", () => {
  it("pins the ADR-0041 contract: no shell, explicit MCP, stream-json", () => {
    const args = claudeWorkerArgs({});
    expect(args).toContain("-p");
    expect(args).not.toContain("--bare");
    expect(args).toContain("--disable-slash-commands");
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

  it("admits Prism's tools by name when a config is supplied (ADR-0050)", () => {
    const args = claudeWorkerArgs({ mcpConfigPath: "/runs/j.mcp.json" });
    expect(args.join(" ")).toContain("--mcp-config /runs/j.mcp.json");
    expect(args).toContain("--strict-mcp-config");
    const tools = (args[args.indexOf("--tools") + 1] ?? "").split(",");
    expect(tools).toEqual(
      expect.arrayContaining(
        WORKER_INTELLIGENCE_TOOLS.map((name) => `mcp__prism__${name}`),
      ),
    );
    // The allowlist is the whole restriction, so the blanket block goes: with
    // it, the tools just named would be blocked too.
    expect(args).not.toContain("mcp__*");
    // Isolation without --bare (which skips keychain OAuth on 2.1+).
    expect(args).not.toContain("--bare");
    expect(args).toContain("Bash");
    expect(tools).not.toContain("Bash");
  });

  it("keeps the blanket MCP block when there is no config", () => {
    // No Console, no config, no MCP — never a wider door than before.
    const args = claudeWorkerArgs({});
    expect(args).toContain("mcp__*");
    expect(args).not.toContain("--mcp-config");
    const tools = (args[args.indexOf("--tools") + 1] ?? "").split(",");
    expect(tools.some((name) => name.startsWith("mcp__"))).toBe(false);
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

  it("can drop a rejected optional flag and keep the safety ones", () => {
    // A worker died with "unknown option '--forward-subagent-text'" before
    // touching a file. Console detail is not worth the job.
    const args = claudeWorkerArgs({
      subagents: true,
      omitFlags: ["--forward-subagent-text"],
    });
    expect(args).not.toContain("--forward-subagent-text");
    expect(args).not.toContain("--bare");
    expect(args).toContain("--disallowedTools");
    expect(args).toContain("Bash");
    expect(args[args.indexOf("--tools") + 1]).toContain("Task");
    expect(args.join(" ")).toContain("--output-format stream-json");
  });
});

describe("unsupported CLI flags", () => {
  it("reads the offending flag out of a launcher error", () => {
    expect(
      unknownOptionFrom("error: unknown option '--forward-subagent-text'"),
    ).toBe("--forward-subagent-text");
    expect(unknownOptionFrom('unknown option "--bare"')).toBe("--bare");
    expect(unknownOptionFrom("claude exited with code 1")).toBeUndefined();
  });

  it("treats only cosmetic flags as droppable", () => {
    expect(isOptionalClaudeFlag("--forward-subagent-text")).toBe(true);
    expect(isOptionalClaudeFlag("--strict-mcp-config")).toBe(true);
    expect(isOptionalClaudeFlag("--disable-slash-commands")).toBe(true);
    // Dropping these would run the agent without its sandbox or leave the
    // stream unreadable, so they must fail loudly instead.
    for (const flag of ["--tools", "--disallowedTools", "-p"]) {
      expect(isOptionalClaudeFlag(flag), flag).toBe(false);
    }
    expect(isOptionalClaudeFlag(undefined)).toBe(false);
    expect(OPTIONAL_CLAUDE_FLAGS).not.toContain("--tools");
  });

  it("removes only the named flag", () => {
    expect(withoutClaudeFlag(["-p", "--bare", "--verbose"], "--bare")).toEqual([
      "-p",
      "--verbose",
    ]);
  });

  it("explains a rejected flag as a version mismatch, not a task failure", () => {
    const text = publicWorkerError(
      "error: unknown option '--forward-subagent-text'",
    );
    expect(text).toContain("--forward-subagent-text");
    expect(text).toMatch(/does not support/i);
    expect(text).toMatch(/update the agent cli/i);
    expect(text).toMatch(/resume/i);
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
