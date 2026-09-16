import { describe, expect, it } from "vitest";
import {
  AgentRegistry,
  createAgentRegistry,
  loadAgentsConfig,
} from "./agent-registry.js";
import type { AgentsConfig } from "./agent-registry.js";

describe("AgentRegistry", () => {
  it("loads built-in agents (cursor, claude)", () => {
    const registry = new AgentRegistry();
    expect(registry.has("cursor")).toBe(true);
    expect(registry.has("claude")).toBe(true);
    expect(registry.names()).toContain("cursor");
    expect(registry.names()).toContain("claude");
  });

  it("merges user agents from config", () => {
    const config: AgentsConfig = {
      opencode: {
        name: "opencode",
        label: "OpenCode",
        cli: "opencode",
        flags: { prompt: "-p", extra: [] },
        outputFormat: "plain-text",
        builtin: false,
      },
    };
    const registry = new AgentRegistry(config);
    expect(registry.has("opencode")).toBe(true);
    expect(registry.has("cursor")).toBe(true); // builtins still present
  });

  it("user config can override builtins", () => {
    const config: AgentsConfig = {
      cursor: {
        name: "cursor",
        label: "My Custom Cursor",
        cli: "my-cursor-cli",
        flags: { prompt: "--prompt", extra: [] },
        outputFormat: "sdk-events",
        builtin: false,
      },
    };
    const registry = new AgentRegistry(config);
    const entry = registry.get("cursor");
    expect(entry?.config.label).toBe("My Custom Cursor");
    expect(entry?.source).toBe("config");
  });

  it("get returns undefined for unknown agents", () => {
    const registry = new AgentRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("is case-insensitive for lookups", () => {
    const registry = new AgentRegistry();
    expect(registry.has("Cursor")).toBe(true);
    expect(registry.has("CLAUDE")).toBe(true);
    expect(registry.get("Claude"))?.toBeDefined();
  });

  it("availableLabel returns comma-separated names", () => {
    const registry = new AgentRegistry();
    const label = registry.availableLabel();
    expect(label).toContain("cursor");
    expect(label).toContain("claude");
    expect(label).toContain(", ");
  });
});

describe("loadAgentsConfig", () => {
  it("returns empty record for nonexistent directory", () => {
    const config = loadAgentsConfig("/nonexistent/path");
    expect(config).toEqual({});
  });
});

describe("createAgentRegistry", () => {
  it("creates registry from nonexistent directory (builtins only)", () => {
    const registry = createAgentRegistry("/nonexistent/path");
    expect(registry.has("cursor")).toBe(true);
    expect(registry.has("claude")).toBe(true);
  });
});
