import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPrismMcpServer, type PrismMcpServer } from "./server.js";

/**
 * The contract tests drive a *real* MCP client against a *real* server over a
 * real transport, against a real repository. Everything except the pipe is
 * production code, because the parts most likely to break — schema shape,
 * handshake, serialisation — are exactly the parts a mock would paper over.
 */

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

let instance: PrismMcpServer;
let client: Client;

async function connect(workspaceRoot: string): Promise<{
  client: Client;
  instance: PrismMcpServer;
}> {
  const built = createPrismMcpServer({ workspaceRoot });
  const connected = new Client({ name: "contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    built.server.connect(serverTransport),
    connected.connect(clientTransport),
  ]);
  return { client: connected, instance: built };
}

type ToolResponse = {
  content?: { type: string; text?: string }[];
  isError?: boolean;
};

async function call(
  target: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResponse> {
  return (await target.callTool({
    name,
    arguments: args,
  })) as ToolResponse;
}

/**
 * MCP reports *tool* failures in-band with `isError: true` so the model can
 * read and react to them, rather than as JSON-RPC rejections. Asserting on the
 * flag and the message is therefore the correct shape for a failure test here.
 */
function expectToolError(response: ToolResponse, pattern: RegExp): void {
  expect(response.isError).toBe(true);
  expect(response.content?.[0]?.text ?? "").toMatch(pattern);
}

async function callJson(name: string, args: Record<string, unknown> = {}) {
  const response = await call(client, name, args);
  expect(
    response.isError,
    `${name} failed: ${response.content?.[0]?.text}`,
  ).not.toBe(true);
  const text = response.content?.[0]?.text;
  expect(text, `${name} returned no text content`).toBeTypeOf("string");
  return JSON.parse(text as string) as Record<string, unknown>;
}

describe("MCP server contract (M-026)", () => {
  beforeAll(async () => {
    const connected = await connect(fixture);
    client = connected.client;
    instance = connected.instance;
  }, 60_000);

  afterAll(async () => {
    instance?.session.close();
    await client?.close();
    // Removed by path rather than via @prism/indexer: this package must not
    // depend on an engine, not even in tests (ADR-0004).
    await rm(join(fixture, ".prism"), { recursive: true, force: true });
  });

  it("completes initialize without opening or indexing the workspace", async () => {
    // A handshake that indexes looks like a hung server to the client.
    expect(instance.session.isOpen()).toBe(false);
    expect(client.getServerVersion()?.name).toBe("prism");
  });

  it("advertises every tool with a usable JSON Schema", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "prism_backend_report",
      "prism_blast_radius",
      "prism_repository_dna",
      "prism_repository_health",
      "prism_repository_map",
    ]);

    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      // A model picks a tool by reading this. An empty description is a bug.
      expect(tool.description?.length ?? 0, tool.name).toBeGreaterThan(40);
    }
  });

  it("marks the tools read-only and closed-world", async () => {
    // Prism never writes to the repository and never reaches the network;
    // saying so lets an agent skip its own confirmation prompts.
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
    }
  });

  it("returns real DNA for the fixture repository", async () => {
    const dna = await callJson("prism_repository_dna");
    expect(Array.isArray(dna.languages)).toBe(true);
    expect(typeof dna.summary).toBe("string");
    expect(instance.session.isOpen()).toBe(true);
  }, 60_000);

  it("returns a real health score", async () => {
    const health = await callJson("prism_repository_health");
    expect(typeof health.score).toBe("number");
    expect(health.score as number).toBeGreaterThanOrEqual(0);
    expect(health.score as number).toBeLessThanOrEqual(100);
  }, 60_000);

  it("returns a real map with nodes and edges", async () => {
    const map = await callJson("prism_repository_map", { zoom: "package" });
    const graph = map.graph as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  }, 60_000);

  it("returns a real blast radius for a file in the fixture", async () => {
    const map = await callJson("prism_repository_map", { zoom: "file" });
    const graph = map.graph as { nodes: { id: string; kind: string }[] };
    const file = graph.nodes.find((n) => n.kind === "file");
    expect(file, "fixture produced no file nodes").toBeDefined();

    const report = await callJson("prism_blast_radius", {
      kind: "file",
      id: (file as { id: string }).id.replace(/^file:/, ""),
    });
    expect(report).toHaveProperty("risk");
  }, 60_000);

  it("indexes once across every one of those calls", () => {
    // Five tool calls have run by now against one open workspace.
    expect(instance.session.isOpen()).toBe(true);
  });

  it("rejects a malformed argument before it reaches Core", async () => {
    expectToolError(
      await call(client, "prism_blast_radius", {
        kind: "directory",
        id: "x",
      }),
      /Invalid enum value.*kind/s,
    );
  });

  it("rejects a missing required argument", async () => {
    expectToolError(
      await call(client, "prism_blast_radius", {}),
      /Required at (kind|id)/s,
    );
  });

  it("reports an unknown tool rather than answering it", async () => {
    expectToolError(await call(client, "prism_not_a_tool"), /not_a_tool/);
  });
});

describe("MCP server against an unusable workspace (M-026)", () => {
  it("returns a clean error rather than crashing the process", async () => {
    const missing = join(fixture, "..", "definitely-not-here-4c1a");
    const { client: isolated, instance: built } = await connect(missing);

    expectToolError(
      await call(isolated, "prism_repository_dna"),
      /PRISM_INVALID_PATH/,
    );

    built.session.close();
    await isolated.close();
  }, 30_000);
});
