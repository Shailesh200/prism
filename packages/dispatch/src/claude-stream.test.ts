import { describe, expect, it } from "vitest";
import {
  claudeActivityFrom,
  claudeLogEntryFrom,
  claudeResultFrom,
  claudeSessionIdFrom,
} from "./claude-stream.js";

const init = {
  type: "system",
  subtype: "init",
  session_id: "sess-1",
  tools: ["Read", "Edit"],
  cwd: "/tmp/worktree",
};

const assistantText = {
  type: "assistant",
  session_id: "sess-1",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "I will update the login form." }],
  },
};

const assistantToolUse = {
  type: "assistant",
  session_id: "sess-1",
  message: {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "Edit",
        input: { file_path: "src/login.ts", old_string: "a", new_string: "b" },
      },
    ],
  },
};

const toolResult = {
  type: "user",
  session_id: "sess-1",
  message: {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }],
  },
};

const toolResultError = {
  type: "user",
  session_id: "sess-1",
  message: {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        is_error: true,
        content: "Edit failed: old_string not found",
      },
    ],
  },
};

const resultOk = {
  type: "result",
  subtype: "success",
  is_error: false,
  session_id: "sess-1",
  result: "Updated src/login.ts to fix the redirect.",
  duration_ms: 1234,
};

describe("claudeSessionIdFrom", () => {
  it("captures the session id from init and result only", () => {
    expect(claudeSessionIdFrom(init)).toBe("sess-1");
    expect(claudeSessionIdFrom(resultOk)).toBe("sess-1");
    expect(claudeSessionIdFrom(assistantText)).toBeUndefined();
    expect(claudeSessionIdFrom(null)).toBeUndefined();
    expect(claudeSessionIdFrom({ type: "system" })).toBeUndefined();
  });
});

describe("claudeResultFrom", () => {
  it("reads the terminal result event", () => {
    expect(claudeResultFrom(resultOk)).toEqual({
      text: "Updated src/login.ts to fix the redirect.",
      isError: false,
      subtype: "success",
    });
    expect(
      claudeResultFrom({
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
      }),
    ).toEqual({ text: "", isError: true, subtype: "error_max_turns" });
    expect(claudeResultFrom(assistantText)).toBeUndefined();
  });
});

describe("claudeLogEntryFrom", () => {
  it("logs init as a running line", () => {
    const entry = claudeLogEntryFrom(init, new Date("2026-08-31T00:00:00Z"));
    expect(entry).toMatchObject({ phase: "running", level: "info" });
  });

  it("logs assistant text as thinking", () => {
    const entry = claudeLogEntryFrom(assistantText);
    expect(entry).toMatchObject({
      phase: "thinking",
      text: "I will update the login form.",
    });
  });

  it("logs edit tool_use as editing with the target file", () => {
    const entry = claudeLogEntryFrom(assistantToolUse);
    expect(entry).toMatchObject({
      phase: "editing",
      tool: "Edit",
    });
    expect(entry?.text).toContain("src/login.ts");
  });

  it("logs non-edit tools as tool lines", () => {
    const grep = {
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Grep", input: { pattern: "login" } },
        ],
      },
    };
    const entry = claudeLogEntryFrom(grep);
    expect(entry).toMatchObject({ phase: "tool", tool: "Grep" });
    expect(entry?.text).toContain("login");
  });

  it("keeps failed tool results and drops successful ones", () => {
    expect(claudeLogEntryFrom(toolResult)).toBeUndefined();
    const entry = claudeLogEntryFrom(toolResultError);
    expect(entry).toMatchObject({ phase: "tool", level: "error" });
    expect(entry?.text).toContain("old_string not found");
  });

  it("ignores unknown events without throwing", () => {
    expect(claudeLogEntryFrom({ type: "rate_limit" })).toBeUndefined();
    expect(claudeLogEntryFrom("nope")).toBeUndefined();
    expect(claudeLogEntryFrom(undefined)).toBeUndefined();
  });
});

describe("claudeActivityFrom", () => {
  it("maps init, tools, edits, and text onto the activity line", () => {
    expect(claudeActivityFrom(init)).toEqual({
      phase: "running",
      lastActivity: "Teammate is on it",
    });
    expect(claudeActivityFrom(assistantToolUse)).toEqual({
      phase: "editing",
      lastActivity: "Editing files",
    });
    expect(claudeActivityFrom(assistantText)?.phase).toBe("thinking");
    expect(
      claudeActivityFrom({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: {} }],
        },
      }),
    ).toEqual({ phase: "tool", lastActivity: "Using Read" });
    expect(claudeActivityFrom(toolResult)).toBeUndefined();
  });
});
