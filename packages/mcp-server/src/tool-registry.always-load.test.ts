import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_LOAD_META,
  registerTools,
  type ToolDefinition,
} from "./tool-registry.js";
import type { WorkspaceSession } from "./session.js";
import { prepareChange } from "./tools/prepare.js";
import { blastRadius, testImpact } from "./tools/impact.js";
import { guardSession } from "./tools/guard.js";

describe("tools Claude Code loads upfront (round 4)", () => {
  it("marks the four tools the hooks name, and only those", async () => {
    const plain: ToolDefinition = {
      name: "plain_tool",
      title: "Plain",
      description: "x",
      inputSchema: {},
      call: async () => ({ ok: true, value: null }),
    };
    const tools = [prepareChange, blastRadius, testImpact, guardSession, plain];
    const server = new McpServer({ name: "prism", version: "0.0.0" });
    registerTools(
      server,
      {} as WorkspaceSession,
      tools as unknown as ToolDefinition<never>[],
      "/tmp",
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(b), client.connect(a)]);
    const { tools: listed } = await client.listTools();
    const upfront = listed
      .filter((t) => t._meta?.[ALWAYS_LOAD_META] === true)
      .map((t) => t.name)
      .sort();
    expect(upfront).toEqual([
      "blast_radius",
      "guard_session",
      "prepare_change",
      "test_impact",
    ]);
    expect(listed.find((t) => t.name === "plain_tool")?._meta).toBeUndefined();
    await client.close();
  });
});
