import { describe, expect, it } from "vitest";
import { AgentRegistry } from "./agent-registry.js";
import {
  resolveWorkerBackend,
  workerBackendLabel,
  isBuiltinBackend,
} from "./worker-backend.js";
import type { AgentsConfig } from "./agent-registry.js";

describe("resolveWorkerBackend", () => {
  it("defaults to cursor when nothing says otherwise", () => {
    expect(resolveWorkerBackend({})).toBe("cursor");
    expect(resolveWorkerBackend({ env: {}, clientName: "cursor" })).toBe(
      "cursor",
    );
  });

  it("matches a Claude Code host from clientInfo", () => {
    expect(resolveWorkerBackend({ clientName: "claude-code" })).toBe("claude");
    expect(resolveWorkerBackend({ clientName: "Claude Desktop" })).toBe(
      "claude",
    );
  });

  it("lets PRISM_WORKER override the host", () => {
    expect(
      resolveWorkerBackend({
        env: { PRISM_WORKER: "claude" },
        clientName: "cursor",
      }),
    ).toBe("claude");
    expect(
      resolveWorkerBackend({
        env: { PRISM_WORKER: " cursor " },
        clientName: "claude-code",
      }),
    ).toBe("cursor");
  });

  it("lets configure beat PRISM_WORKER and the host", () => {
    expect(
      resolveWorkerBackend({
        config: { workerBackend: "cursor" },
        env: { PRISM_WORKER: "claude" },
        clientName: "claude-code",
      }),
    ).toBe("cursor");
    expect(
      resolveWorkerBackend({
        config: { workerBackend: "claude" },
        clientName: "cursor",
      }),
    ).toBe("claude");
    // "auto" falls through to env/host.
    expect(
      resolveWorkerBackend({
        config: { workerBackend: "auto" },
        clientName: "claude-code",
      }),
    ).toBe("claude");
  });

  it("ignores junk env values", () => {
    expect(resolveWorkerBackend({ env: { PRISM_WORKER: "gemini" } })).toBe(
      "cursor",
    );
  });
});

describe("resolveWorkerBackend with registry", () => {
  const customAgents: AgentsConfig = {
    opencode: {
      name: "opencode",
      label: "OpenCode",
      cli: "opencode",
      flags: { prompt: "-p", extra: [] },
      outputFormat: "plain-text",
      builtin: false,
    },
    kilo: {
      name: "kilo",
      label: "Kilo Code",
      cli: "kilo-cli",
      flags: { prompt: "--prompt", extra: [] },
      outputFormat: "plain-text",
      builtin: false,
    },
  };
  const registry = new AgentRegistry(customAgents);

  it("resolves custom agent from clientInfo via registry lookup", () => {
    expect(
      resolveWorkerBackend({
        clientName: "opencode",
        registry,
      }),
    ).toBe("opencode");
  });

  it("resolves custom agent via substring match", () => {
    expect(
      resolveWorkerBackend({
        clientName: "kilo-code-2.0",
        registry,
      }),
    ).toBe("kilo");
  });

  it("config override still works with registry", () => {
    expect(
      resolveWorkerBackend({
        config: { workerBackend: "opencode" },
        clientName: "kilo",
        registry,
      }),
    ).toBe("opencode");
  });

  it("PRISM_WORKER with registry agent name works", () => {
    expect(
      resolveWorkerBackend({
        env: { PRISM_WORKER: "opencode" },
        registry,
      }),
    ).toBe("opencode");
  });

  it("falls back to cursor for unknown agent without registry", () => {
    expect(
      resolveWorkerBackend({
        clientName: "unknown-agent",
      }),
    ).toBe("cursor");
  });

  it("unknown agent with registry falls back to cursor", () => {
    expect(
      resolveWorkerBackend({
        clientName: "unknown-agent",
        registry,
      }),
    ).toBe("cursor");
  });
});

describe("workerBackendLabel", () => {
  it("names the backend for doctor output", () => {
    expect(workerBackendLabel("cursor")).toBe("Cursor");
    expect(workerBackendLabel("claude")).toBe("Claude Code");
  });

  it("uses registry label for custom agents", () => {
    const customAgents: AgentsConfig = {
      opencode: {
        name: "opencode",
        label: "OpenCode",
        cli: "opencode",
        flags: { prompt: "-p", extra: [] },
        outputFormat: "plain-text",
        builtin: false,
      },
    };
    const registry = new AgentRegistry(customAgents);
    expect(workerBackendLabel("opencode", registry)).toBe("OpenCode");
  });

  it("falls back to raw name for unknown agents", () => {
    expect(workerBackendLabel("unknown")).toBe("unknown");
  });
});

describe("isBuiltinBackend", () => {
  it("cursor and claude are builtin", () => {
    expect(isBuiltinBackend("cursor")).toBe(true);
    expect(isBuiltinBackend("claude")).toBe(true);
  });

  it("custom agent is not builtin", () => {
    const customAgents: AgentsConfig = {
      opencode: {
        name: "opencode",
        label: "OpenCode",
        cli: "opencode",
        flags: { prompt: "-p", extra: [] },
        outputFormat: "plain-text",
        builtin: false,
      },
    };
    const registry = new AgentRegistry(customAgents);
    expect(isBuiltinBackend("opencode", registry)).toBe(false);
  });

  it("unknown agent is not builtin", () => {
    expect(isBuiltinBackend("unknown")).toBe(false);
  });
});
