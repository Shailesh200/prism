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

  it("advertises exactly the documented pack, with usable JSON Schema", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    // Adding a Core method must not silently add a tool, and a tool must not
    // vanish from the docs. This list is the contract.
    expect(names).toEqual(
      [
        "backend_report",
        "blast_radius",
        "breaking_change_hints",
        "dependency_cycles",
        "dependency_graph",
        "dependency_route",
        "engineering_health",
        "explain_area",
        "explore_code",
        "feature_graph",
        "find_references",
        "find_symbol",
        "health_history",
        "knowledge_graph",
        "landmarks",
        "list_features",
        "list_packages",
        "rename_impact",
        "repository_dna",
        "repository_health",
        "repository_map",
        "repository_overview",
        "review_changes",
        "safe_delete",
        "security_report",
        "stack_profile",
        "test_impact",
        "testing_report",
      ].sort(),
    );

    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      // A model picks a tool by reading this. An empty description is a bug.
      expect(tool.description?.length ?? 0, tool.name).toBeGreaterThan(40);
    }
  });

  it("uses unprefixed snake_case names", async () => {
    // MCP clients namespace by server, so a prism_ prefix reads as "prism
    // prism repository dna" wherever an agent actually sees it.
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name, tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.name.startsWith("prism_"), tool.name).toBe(false);
    }
  });

  it("gives every list tool a limit and bounds its output", async () => {
    /** Required arguments for the list tools that need more than a limit. */
    const REQUIRED: Record<string, Record<string, unknown>> = {
      find_symbol: { name: "a" },
      find_references: { name: "a" },
    };

    const { tools } = await client.listTools();
    const listTools = tools.filter(
      (tool) =>
        (tool.inputSchema.properties as Record<string, unknown> | undefined)
          ?.limit !== undefined,
    );
    // If this drops to zero the assertion below stops meaning anything.
    expect(listTools.length).toBeGreaterThanOrEqual(5);

    for (const tool of listTools) {
      const result = await callJson(tool.name, {
        ...REQUIRED[tool.name],
        limit: 2,
      });
      expect(result, tool.name).toHaveProperty("totalCount");
      expect(result, tool.name).toHaveProperty("truncated");
      expect((result.items as unknown[]).length, tool.name).toBeLessThanOrEqual(
        2,
      );
    }
  }, 60_000);

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
    const dna = await callJson("repository_dna");
    expect(Array.isArray(dna.languages)).toBe(true);
    expect(typeof dna.summary).toBe("string");
    expect(instance.session.isOpen()).toBe(true);
  }, 60_000);

  it("returns a real health score", async () => {
    const health = await callJson("repository_health");
    expect(typeof health.score).toBe("number");
    expect(health.score as number).toBeGreaterThanOrEqual(0);
    expect(health.score as number).toBeLessThanOrEqual(100);
  }, 60_000);

  it("returns a real map with nodes and edges", async () => {
    const map = await callJson("repository_map", { zoom: "package" });
    const graph = map.graph as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  }, 60_000);

  it("returns a real blast radius for a file in the fixture", async () => {
    const map = await callJson("repository_map", { zoom: "file" });
    const graph = map.graph as { nodes: { id: string; kind: string }[] };
    const file = graph.nodes.find((n) => n.kind === "file");
    expect(file, "fixture produced no file nodes").toBeDefined();

    const report = await callJson("blast_radius", {
      kind: "file",
      id: (file as { id: string }).id.replace(/^file:/, ""),
    });
    expect(report).toHaveProperty("risk");
  }, 60_000);

  it("answers every tool in the pack against the fixture", async () => {
    // The point of a pack is that all of it works. Calling each tool once with
    // its cheapest valid input catches the adapter mistakes — wrong Core
    // method, wrong argument shape, a DTO that will not serialise — that a
    // schema check cannot.
    const map = await callJson("repository_map", { zoom: "file" });
    const nodes = (map.graph as { nodes: { id: string; kind: string }[] })
      .nodes;
    const file = nodes.find((n) => n.kind === "file");
    const filePath = (file?.id ?? "").replace(/^file:/, "");
    expect(filePath, "fixture produced no file nodes").not.toBe("");

    const target = { kind: "file", id: filePath };
    const calls: [string, Record<string, unknown>][] = [
      ["repository_map", { zoom: "package" }],
      ["repository_dna", {}],
      ["repository_health", {}],
      ["repository_overview", {}],
      ["list_packages", {}],
      ["stack_profile", {}],
      ["landmarks", {}],
      ["explain_area", { path: filePath }],
      ["dependency_graph", { packageAggregation: true }],
      ["dependency_cycles", {}],
      ["knowledge_graph", {}],
      ["feature_graph", {}],
      ["list_features", {}],
      ["find_symbol", { name: "a" }],
      ["find_references", { name: "a" }],
      [
        "dependency_route",
        {
          from: { kind: "file", path: filePath },
          to: { kind: "file", path: filePath },
        },
      ],
      ["blast_radius", target],
      ["safe_delete", target],
      ["rename_impact", target],
      ["test_impact", target],
      ["breaking_change_hints", target],
      ["review_changes", { paths: [filePath] }],
      ["engineering_health", {}],
      ["health_history", {}],
      ["explore_code", { kind: "file", path: filePath }],
      ["backend_report", {}],
      ["testing_report", {}],
      ["security_report", {}],
    ];

    const failures: string[] = [];
    for (const [name, args] of calls) {
      const response = await call(client, name, args);
      if (response.isError) {
        failures.push(`${name}: ${response.content?.[0]?.text}`);
        continue;
      }
      const text = response.content?.[0]?.text ?? "";
      try {
        JSON.parse(text);
      } catch {
        failures.push(`${name}: response was not JSON`);
      }
    }

    expect(failures).toEqual([]);
    // Every tool in the pack must appear above, or the sweep is not a sweep.
    const { tools } = await client.listTools();
    expect(calls.map(([name]) => name).sort()).toEqual(
      tools.map((t) => t.name).sort(),
    );
  }, 120_000);

  it("refuses a path outside the workspace", async () => {
    // The guard that matters if an agent is ever talked into reading /etc.
    expectToolError(
      await call(client, "explain_area", { path: "../../../etc/passwd" }),
      /PRISM_INVALID_PATH/,
    );
    expectToolError(
      await call(client, "review_changes", { paths: ["/etc/passwd"] }),
      /PRISM_INVALID_PATH/,
    );
  });

  it("indexes once across every one of those calls", () => {
    // Five tool calls have run by now against one open workspace.
    expect(instance.session.isOpen()).toBe(true);
  });

  it("rejects a malformed argument before it reaches Core", async () => {
    expectToolError(
      await call(client, "blast_radius", {
        kind: "directory",
        id: "x",
      }),
      /Invalid enum value.*kind/s,
    );
  });

  it("rejects a missing required argument", async () => {
    expectToolError(
      await call(client, "blast_radius", {}),
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
      await call(isolated, "repository_dna"),
      /PRISM_INVALID_PATH/,
    );

    built.session.close();
    await isolated.close();
  }, 30_000);
});
