import { describe, expect, it } from "vitest";
import {
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
});
