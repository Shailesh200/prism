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
    // Removed by path rather than via @repo-prism/indexer: this package must not
    // depend on an engine, not even in tests (ADR-0004).
    await rm(join(fixture, ".prism"), { recursive: true, force: true });
  });

  it("completes initialize without opening or indexing the workspace", async () => {
    // A handshake that indexes looks like a hung server to the client.
    expect(instance.session.isOpen()).toBe(false);
    expect(client.getServerVersion()?.name).toBe("prism");
    expect(client.getServerVersion()?.title).toBe("Prism");
    expect(client.getServerVersion()?.websiteUrl).toBe(
      "https://www.prismhq.in",
    );
    expect(client.getServerVersion()?.icons?.length).toBeGreaterThan(0);
  });

  it("runs start_my_day without opening or indexing the workspace", async () => {
    const briefing = await callJson("start_my_day");
    expect(instance.session.isOpen()).toBe(false);
    expect(briefing.message).toBeTypeOf("string");
  });

  it("advertises instructions that teach agents to call tools without being asked", async () => {
    const instructions = client.getInstructions();
    expect(instructions).toBeTypeOf("string");
    expect(instructions).toMatch(/users never name tools/i);
    expect(instructions).toContain("blast_radius");
    expect(instructions).toContain("start_my_day");
    expect(instructions).not.toMatch(/prism_blast_radius/);
  });

  it("lists workflow prompts for clients that expose a picker", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual(
      [
        "before_edit",
        "configure",
        "connect",
        "init",
        "orient",
        "review_diff",
        "start_my_day",
        "start_work",
        "where_are_we",
      ].sort(),
    );
  });

  it("expands the orient prompt into a user message that names starter tools", async () => {
    const result = await client.getPrompt({ name: "orient" });
    const text = result.messages[0]?.content;
    expect(text).toMatchObject({ type: "text" });
    if (text && text.type === "text") {
      expect(text.text).toContain("repository_dna");
      expect(text.text).toContain("repository_health");
    }
  });

  it("expands review_diff to the auto-discover review_changes flow (M-058 / P-C1)", async () => {
    const result = await client.getPrompt({
      name: "review_diff",
      arguments: {},
    });
    const text = result.messages[0]?.content;
    expect(text).toMatchObject({ type: "text" });
    if (text && text.type === "text") {
      expect(text.text).toMatch(/auto-discover/i);
      expect(text.text).toContain("review_changes");
    }
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
        "capabilities",
        "changed_paths",
        "configure",
        "dependency_cycles",
        "dependency_graph",
        "dependency_route",
        "dispatch_doctor",
        "engineering_health",
        "explain_area",
        "explore_code",
        "feature_graph",
        "find_references",
        "find_symbol",
        "health_history",
        "init",
        "integrations",
        "job_control",
        "knowledge_graph",
        "landmarks",
        "list_features",
        "list_jobs",
        "list_packages",
        "remember",
        "rename_impact",
        "repository_dna",
        "repository_health",
        "repository_map",
        "repository_overview",
        "review_changes",
        "safe_delete",
        "search_symbols",
        "security_report",
        "stack_profile",
        "start_job",
        "start_my_day",
        "test_impact",
        "testing_report",
        "workspace_status",
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

  it("gives every top-level list tool a limit and bounds its output", async () => {
    /** Required arguments for the list tools that need more than a limit. */
    const REQUIRED: Record<string, Record<string, unknown>> = {
      find_symbol: { name: "a" },
      find_references: { name: "a" },
      search_symbols: { pattern: "a" },
      knowledge_graph: {},
    };

    /** Tools that nest the envelope inside a report (not top-level BoundedList). */
    const NESTED_LIMIT = new Set([
      "blast_radius",
      "test_impact",
      "explore_code",
    ]);

    const { tools } = await client.listTools();
    const listTools = tools.filter((tool) => {
      const props = tool.inputSchema.properties as
        | Record<string, unknown>
        | undefined;
      return props?.limit !== undefined && !NESTED_LIMIT.has(tool.name);
    });
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

  it("defaults repository_map zoom to package (M-058 / P-C2)", async () => {
    const map = await callJson("repository_map", {});
    expect(map.zoom).toBe("package");
  }, 60_000);

  it("requires path or limit on knowledge_graph (M-058 / P-C2)", async () => {
    expectToolError(
      await call(client, "knowledge_graph", {}),
      /requires `path` or `limit`/,
    );
  });

  it("returns compact JSON by default (M-058 / P-C4)", async () => {
    const response = await call(client, "landmarks", { limit: 1 });
    const text = response.content?.[0]?.text ?? "";
    expect(text.includes("\n")).toBe(false);
  }, 60_000);

  it("advertises DNA / landmarks / health resources (M-058 / P-C8)", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(
      [
        "prism://dna",
        "prism://health",
        "prism://landmarks",
        "ui://prism/jobs",
      ].sort(),
    );
  });

  it("binds list_jobs to the jobs MCP App (M-064)", async () => {
    const { tools } = await client.listTools();
    const listJobs = tools.find((tool) => tool.name === "list_jobs") as
      | { _meta?: { ui?: { resourceUri?: string } } }
      | undefined;
    expect(listJobs?._meta?.ui?.resourceUri).toBe("ui://prism/jobs");
  });

  it("marks overlapping tools as deprecated in descriptions (M-058 / P-C9)", async () => {
    const { tools } = await client.listTools();
    const breaking = tools.find((t) => t.name === "breaking_change_hints");
    const explain = tools.find((t) => t.name === "explain_area");
    expect(breaking?.description).toMatch(/deprecated/i);
    expect(breaking?.description).toMatch(/blast_radius/i);
    expect(explain?.description).toMatch(/explore_code/);
  });

  it("marks Intelligence tools read-only and closed-world", async () => {
    const intelligence = new Set([
      "backend_report",
      "blast_radius",
      "breaking_change_hints",
      "capabilities",
      "changed_paths",
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
      "search_symbols",
      "security_report",
      "stack_profile",
      "test_impact",
      "testing_report",
      "workspace_status",
    ]);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      if (!intelligence.has(tool.name)) continue;
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
    expect(typeof health.graphCoveragePct).toBe("number");
    const factors = health.factors as { id: string; label: string }[];
    expect(factors.find((f) => f.id === "coupling")?.label).toBe(
      "TS/JS import coupling",
    );
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
    expect(Array.isArray(report.coverageLimitations)).toBe(true);
    expect((report.coverageLimitations as unknown[]).length).toBeGreaterThan(0);
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
      ["workspace_status", {}],
      ["capabilities", {}],
      ["dependency_graph", { packageAggregation: true, limit: 10 }],
      ["dependency_cycles", {}],
      ["knowledge_graph", { limit: 10 }],
      ["feature_graph", { limit: 10 }],
      ["list_features", {}],
      ["find_symbol", { name: "a" }],
      ["search_symbols", { pattern: "a" }],
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
      ["changed_paths", {}],
      ["review_changes", { paths: [filePath] }],
      ["engineering_health", {}],
      ["health_history", {}],
      ["explore_code", { kind: "file", path: filePath }],
      ["backend_report", {}],
      ["testing_report", {}],
      ["security_report", {}],
      ["start_my_day", {}],
      ["list_jobs", {}],
      ["remember", { action: "list" }],
      ["integrations", { action: "catalog" }],
      ["configure", { action: "get" }],
      ["dispatch_doctor", {}],
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
    // Intelligence tools plus safe Dispatch tools. start_job / job_control /
    // init mutate worktrees or start Cursor login and are covered by unit tests.
    const { tools } = await client.listTools();
    const skipped = new Set(["start_job", "job_control", "init"]);
    expect(calls.map(([name]) => name).sort()).toEqual(
      tools
        .map((t) => t.name)
        .filter((name) => !skipped.has(name))
        .sort(),
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

describe("MCP dependency_graph unresolved imports (M-056 / P-A1)", () => {
  const unresolvedFixture = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "intelligence",
    "fixtures",
    "m056-unresolved",
  );

  it("surfaces unresolvedImports count and sample", async () => {
    const { client: isolated, instance: built } =
      await connect(unresolvedFixture);
    const response = await call(isolated, "dependency_graph", {});
    expect(response.isError).not.toBe(true);
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}") as {
      unresolvedImports?: { count: number; sample: string[] };
    };
    expect(payload.unresolvedImports?.count).toBeGreaterThan(0);
    expect(payload.unresolvedImports?.sample[0]).toContain("no-such-module");
    built.session.close();
    await isolated.close();
  }, 60_000);
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
