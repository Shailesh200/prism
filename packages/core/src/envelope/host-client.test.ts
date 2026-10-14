import { describe, expect, it } from "vitest";
import {
  detectModel,
  envelopeHostFromClient,
  envelopeHostFromEnv,
  envelopeHostProbe,
} from "./host-client.js";

describe("envelopeHostFromClient", () => {
  it("maps Cursor, Claude Code, and VS Code from MCP client names", () => {
    expect(envelopeHostFromClient("cursor-vscode")).toBe("cursor");
    expect(envelopeHostFromClient("Claude Code")).toBe("claude");
    expect(envelopeHostFromClient("Visual Studio Code")).toBe("vscode");
  });

  it("omits a missing name rather than writing unknown", () => {
    expect(envelopeHostFromClient(undefined)).toBeUndefined();
    expect(envelopeHostFromClient("  ")).toBeUndefined();
  });
});

describe("envelopeHostFromEnv", () => {
  it("names Claude from CLAUDECODE without storing the value", () => {
    expect(envelopeHostFromEnv({ CLAUDECODE: "1" })).toBe("claude");
  });

  it("names Cursor from a Cursor IPC hook, not from a generic PATH", () => {
    expect(
      envelopeHostFromEnv({
        VSCODE_IPC_HOOK: "/tmp/Cursor/1.7-main.sock",
      }),
    ).toBe("cursor");
    expect(envelopeHostFromEnv({ PATH: "/opt/cursor/bin" })).toBeUndefined();
  });

  it("prefers Claude when both fingerprints are present", () => {
    expect(
      envelopeHostFromEnv({
        CLAUDECODE: "1",
        CURSOR_AGENT: "1",
      }),
    ).toBe("claude");
  });
});

describe("envelopeHostProbe", () => {
  it("prefers the MCP handshake over env", () => {
    expect(
      envelopeHostProbe({
        client: { name: "cursor-vscode", version: "1.7.0" },
        env: { CLAUDECODE: "1" },
      }),
    ).toEqual({
      host: "cursor",
      hostSource: "mcp",
      clientName: "cursor-vscode",
      clientVersion: "1.7.0",
    });
  });

  it("falls back to env and still keeps a raw handshake name", () => {
    expect(
      envelopeHostProbe({
        client: { name: "   " },
        env: { CURSOR_TRACE_ID: "abc" },
      }),
    ).toEqual({
      host: "cursor",
      hostSource: "env",
    });
  });

  it("keeps handshake meta when no host can be named", () => {
    expect(
      envelopeHostProbe({
        client: { name: "mystery-agent", version: "0.1" },
        env: {},
      }),
    ).toMatchObject({
      host: "mystery-agent",
      hostSource: "mcp",
      clientName: "mystery-agent",
      clientVersion: "0.1",
    });
  });

  it("uses the worker backend when MCP and env are empty", () => {
    expect(
      envelopeHostProbe({
        env: {},
        workerHost: "claude",
      }),
    ).toEqual({ host: "claude", hostSource: "worker" });
  });

  it("detects model from ANTHROPIC_MODEL env var", () => {
    expect(
      envelopeHostProbe({
        client: { name: "claude-code", version: "1.0" },
        env: { ANTHROPIC_MODEL: "claude-sonnet-4-20250514" },
      }),
    ).toMatchObject({
      host: "claude",
      clientModel: "claude-sonnet-4-20250514",
    });
  });

  it("detects model from OPENAI_MODEL env var", () => {
    expect(
      envelopeHostProbe({
        client: { name: "opencode", version: "1.0" },
        env: { OPENAI_MODEL: "gpt-4o" },
      }),
    ).toMatchObject({
      host: "opencode",
      clientModel: "gpt-4o",
    });
  });

  it("detects model from clientInfo title parenthetical", () => {
    expect(
      envelopeHostProbe({
        client: {
          name: "opencode",
          version: "1.0",
          title: "OpenCode (claude-3-opus)",
        },
        env: {},
      }),
    ).toMatchObject({
      host: "opencode",
      clientModel: "claude-3-opus",
    });
  });

  it("env var takes precedence over title model", () => {
    expect(
      envelopeHostProbe({
        client: { name: "opencode", version: "1.0", title: "OpenCode (gpt-4)" },
        env: { ANTHROPIC_MODEL: "claude-sonnet-4-20250514" },
      }),
    ).toMatchObject({
      clientModel: "claude-sonnet-4-20250514",
    });
  });
});

describe("detectModel", () => {
  it("returns undefined when no model info available", () => {
    expect(detectModel({})).toBeUndefined();
  });

  it("detects from ANTHROPIC_MODEL", () => {
    expect(detectModel({ ANTHROPIC_MODEL: "claude-sonnet-4-20250514" })).toBe(
      "claude-sonnet-4-20250514",
    );
  });

  it("detects from OPENAI_MODEL", () => {
    expect(detectModel({ OPENAI_MODEL: "gpt-4o" })).toBe("gpt-4o");
  });

  it("detects from GEMINI_MODEL", () => {
    expect(detectModel({ GEMINI_MODEL: "gemini-pro" })).toBe("gemini-pro");
  });

  it("detects from clientInfo title", () => {
    expect(detectModel({}, "MyAgent (gpt-4o)")).toBe("gpt-4o");
  });

  it("env var takes precedence over title", () => {
    expect(
      detectModel({ OPENAI_MODEL: "gpt-4o" }, "MyAgent (claude-3-opus)"),
    ).toBe("gpt-4o");
  });
});
