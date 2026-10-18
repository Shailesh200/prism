import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPrismMcpServer, type PrismMcpServer } from "./server.js";
import { DEFAULT_TOOL_NAMES, OPT_IN_TOOL_NAMES } from "./tools.js";

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

/** A Prism home whose `config.json` opts into every extra tool (COV-19). */
function prismHomeWith(extraTools: readonly string[]): string {
  const home = mkdtempSync(join(tmpdir(), "prism-contract-home-"));
  writeFileSync(join(home, "config.json"), JSON.stringify({ extraTools }));
  return home;
}
const fullHome = prismHomeWith(OPT_IN_TOOL_NAMES);

let instance: PrismMcpServer;
let client: Client;

async function connect(
  workspaceRoot: string,
  prismHome: string = fullHome,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<{
  client: Client;
  instance: PrismMcpServer;
}> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PRISM_HOME: prismHome,
    ...extraEnv,
  };
  if (!("PRISM_EXTRA_TOOLS" in extraEnv)) delete env.PRISM_EXTRA_TOOLS;
  const built = createPrismMcpServer({
    workspaceRoot,
    env,
  });
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

/** A source file from the fixture's dependency graph. */
async function firstFixtureFile(): Promise<string> {
  const graph = await callJson("dependency_graph", { limit: 50 });
  const items = graph.items as { id: string; kind?: string }[];
  const file = items.find((n) => n.id.startsWith("file:"));
  expect(file, "fixture produced no file nodes").toBeDefined();
  return (file as { id: string }).id.replace(/^file:/, "");
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

  it("advertises instructions that teach agents to call tools without being asked", async () => {
    const instructions = client.getInstructions();
    expect(instructions).toBeTypeOf("string");
    expect(instructions).toMatch(/users never name these tools/i);
    expect(instructions).toContain("blast_radius");
    expect(instructions).not.toContain("start_my_day");
    expect(instructions).not.toMatch(/prism_blast_radius/);
  });

  it("lists workflow prompts for clients that expose a picker", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual(
      ["before_edit", "orient", "review_diff"].sort(),
    );
  });

  it("expands the orient prompt into a user message that names starter tools", async () => {
    const result = await client.getPrompt({ name: "orient" });
    const text = result.messages[0]?.content;
    expect(text).toMatchObject({ type: "text" });
    if (text && text.type === "text") {
      expect(text.text).toContain("repository_overview");
    }
  });

  it("expands review_diff to guard_session and blast_radius", async () => {
    const result = await client.getPrompt({
      name: "review_diff",
      arguments: {},
    });
    const text = result.messages[0]?.content;
    expect(text).toMatchObject({ type: "text" });
    if (text && text.type === "text") {
      expect(text.text).toContain("guard_session");
      expect(text.text).toContain("blast_radius");
    }
  });

  it("advertises exactly the documented pack, with usable JSON Schema", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    // Adding a Core method must not silently add a tool, and a tool must not
    // vanish from the docs. This list is the contract.
    expect(names).toEqual([...DEFAULT_TOOL_NAMES, ...OPT_IN_TOOL_NAMES].sort());

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
      knowledge_graph: {},
    };

    /** Tools that nest the envelope inside a report (not top-level BoundedList). */
    const NESTED_LIMIT = new Set([
      "blast_radius",
      "test_impact",
      "explore_code",
      "repository_overview",
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

  it("requires path or limit on knowledge_graph (M-058 / P-C2)", async () => {
    expectToolError(
      await call(client, "knowledge_graph", {}),
      /requires `path` or `limit`/,
    );
  });

  it("returns compact JSON by default (M-058 / P-C4)", async () => {
    const response = await call(client, "list_packages", { limit: 1 });
    const text = response.content?.[0]?.text ?? "";
    expect(text.includes("\n")).toBe(false);
  }, 60_000);

  it("CACHE-1: two answers on an unchanged repo share a long identical prefix", async () => {
    const texts: string[] = [];
    for (const name of ["repository_overview", "repository_overview"]) {
      const response = await call(client, name, {});
      texts.push(response.content?.[0]?.text ?? "");
    }
    const [a = "", b = ""] = texts;
    let common = 0;
    while (common < a.length && a[common] === b[common]) common += 1;
    expect(
      common / Math.max(a.length, 1),
      `first difference: …${a.slice(Math.max(0, common - 60), common + 60)}…`,
    ).toBeGreaterThanOrEqual(0.7);
  }, 60_000);

  it("advertises DNA / landmarks resources (M-058 / P-C8)", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(
      ["prism://agents-md", "prism://dna", "prism://landmarks"].sort(),
    );
  });

  it("marks Intelligence tools read-only and closed-world", async () => {
    const intelligence = new Set<string>([
      ...DEFAULT_TOOL_NAMES,
      ...OPT_IN_TOOL_NAMES.filter((name) => name !== "review_with"),
    ]);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      if (!intelligence.has(tool.name)) continue;
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
    }
  });

  it("returns real DNA for the fixture repository", async () => {
    const overview = await callJson("repository_overview");
    const dna = overview.dna as Record<string, unknown>;
    expect(Array.isArray(dna.languages)).toBe(true);
    expect(typeof dna.summary).toBe("string");
    expect(instance.session.isOpen()).toBe(true);
  }, 60_000);

  it("returns a real blast radius for a file in the fixture", async () => {
    const filePath = await firstFixtureFile();
    const report = await callJson("blast_radius", {
      kind: "file",
      id: filePath,
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
    const filePath = await firstFixtureFile();

    const target = { kind: "file", id: filePath };
    const calls: [string, Record<string, unknown>][] = [
      ["repository_overview", {}],
      ["list_packages", {}],
      ["prepare_change", { task: "add caching" }],
      ["explain_area", { path: filePath }],
      ["guard_session", {}],
      ["agents_md", { action: "generate" }],
      ["workspace_status", {}],
      ["capabilities", {}],
      ["dependency_graph", { packageAggregation: true, limit: 10 }],
      ["dependency_cycles", {}],
      ["knowledge_graph", { limit: 10 }],
      ["list_findings", {}],
      ["graph", { mode: "find", name: "renderDashboard" }],
      ["graph", { mode: "neighbors", target: { path: filePath } }],
      ["graph", { mode: "explain", path: filePath }],
      ["graph", { mode: "query", filter: "importers_of", of: filePath }],
      ["blast_radius", target],
      ["safe_delete", target],
      ["rename_impact", target],
      ["test_impact", target],
      ["guard_session", { review: true, paths: [filePath] }],
      ["review_with", { task: "review the change" }],
      ["receipt", {}],
      ["habits", {}],
      ["explore_code", { kind: "file", path: filePath }],
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
    const { tools } = await client.listTools();
    // `graph` is called once per mode; the set of names is what must match.
    expect([...new Set(calls.map(([name]) => name))].sort()).toEqual(
      tools.map((t) => t.name).sort(),
    );
  }, 120_000);

  it("GRD-R1/R2: guard_session review:true carries the review; nine default tools", async () => {
    const plain = JSON.parse(
      (await call(client, "guard_session", {})).content?.[0]?.text ?? "{}",
    ) as Record<string, unknown>;
    expect(plain.review).toBeUndefined();
    const reviewed = JSON.parse(
      (await call(client, "guard_session", { review: true })).content?.[0]
        ?.text ?? "{}",
    ) as { review?: { findings?: unknown; paths?: unknown } };
    expect(reviewed.review).toBeDefined();
    expect(reviewed.review).toHaveProperty("findings");
    expect([...DEFAULT_TOOL_NAMES].sort()).toEqual([
      "blast_radius",
      "graph",
      "guard_session",
      "habits",
      "prepare_change",
      "rename_impact",
      "repository_overview",
      "safe_delete",
      "test_impact",
    ]);
  });

  it("refuses a path outside the workspace", async () => {
    // The guard that matters if an agent is ever talked into reading /etc.
    expectToolError(
      await call(client, "explain_area", { path: "../../../etc/passwd" }),
      /PRISM_INVALID_PATH/,
    );
    expectToolError(
      await call(client, "guard_session", {
        review: true,
        paths: ["/etc/passwd"],
      }),
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

  it("treats every name deleted in 2.0 as an unknown tool (§0.3, decision 10)", async () => {
    const list = JSON.parse(
      readFileSync(
        new URL("../../../scripts/deleted-names.json", import.meta.url),
        "utf8",
      ),
    ) as { names: string[] };
    const deleted = list.names.filter((name) =>
      /^[a-z]+(?:_[a-z]+)+$/.test(name),
    );
    expect(deleted.length).toBeGreaterThan(10);
    // Removed from the default surface too (they never shipped as their own tools).
    for (const name of [...deleted, "landmarks", "lens"]) {
      expectToolError(await call(client, name), new RegExp(name));
    }
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
      await call(isolated, "repository_overview"),
      /PRISM_INVALID_PATH/,
    );

    built.session.close();
    await isolated.close();
  }, 30_000);
});

describe("MCP default tool surface (§0.3, COV-19)", () => {
  it("registers exactly the nine default tools with no extraTools", async () => {
    const { client: isolated, instance: built } = await connect(
      fixture,
      prismHomeWith([]),
    );
    const { tools } = await isolated.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [...DEFAULT_TOOL_NAMES].sort(),
    );
    expect(tools).toHaveLength(9);
    built.session.close();
    await isolated.close();
  });

  it("adds an opt-in tool named in extraTools and nothing else", async () => {
    const { client: isolated, instance: built } = await connect(
      fixture,
      prismHomeWith(["dependency_graph", "not_a_real_tool"]),
    );
    const { tools } = await isolated.listTools();
    expect(tools).toHaveLength(10);
    expect(tools.map((t) => t.name)).toContain("dependency_graph");
    built.session.close();
    await isolated.close();
  });

  it("adds a tool named in PRISM_EXTRA_TOOLS without a second config file", async () => {
    const { client: isolated, instance: built } = await connect(
      fixture,
      prismHomeWith([]),
      { PRISM_EXTRA_TOOLS: "receipt" },
    );
    const { tools } = await isolated.listTools();
    expect(tools).toHaveLength(10);
    expect(tools.map((t) => t.name)).toContain("receipt");
    built.session.close();
    await isolated.close();
  });
});
