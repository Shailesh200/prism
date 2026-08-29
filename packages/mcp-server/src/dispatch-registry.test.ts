import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DISPATCH_TOOLS } from "./dispatch-registry.js";
import { createPrismMcpServer, type PrismMcpServer } from "./server.js";

type ToolResponse = {
  content?: { type: string; text?: string }[];
  isError?: boolean;
};

describe("Dispatch MCP registration", () => {
  it("gives every Dispatch tool a usable description", () => {
    for (const tool of DISPATCH_TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(80);
    }
  });
});

describe("worker role omits recursive tools", () => {
  let instance: PrismMcpServer;
  let client: Client;
  let root = "";

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "prism-dispatch-mcp-"));
    const built = createPrismMcpServer({
      workspaceRoot: root,
      env: { PRISM_DISPATCH_ROLE: "worker" },
    });
    const connected = new Client({ name: "worker-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      built.server.connect(serverTransport),
      connected.connect(clientTransport),
    ]);
    instance = built;
    client = connected;
  });

  afterAll(async () => {
    instance?.session.close();
    await client?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("keeps list_jobs, hides start_job and Intelligence", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).not.toContain("blast_radius");
    expect(names).not.toContain("repository_health");
    expect(names).toContain("list_jobs");
    expect(names).toContain("remember");
    expect(names).not.toContain("start_job");
    expect(names).not.toContain("start_my_day");
    expect(names).not.toContain("init");
  });
});

describe("start_job without a git repository", () => {
  it("returns a spoken error instead of a JSON-RPC throw", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-dispatch-nogit-"));
    const built = createPrismMcpServer({ workspaceRoot: root });
    const client = new Client({ name: "nogit-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      built.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const response = (await client.callTool({
        name: "start_job",
        arguments: { title: "Review PR", prd: "Look at the diff" },
      })) as ToolResponse;
      expect(response.isError).not.toBe(true);
      const text = response.content?.[0]?.text ?? "";
      expect(text).toMatch(/git repository/i);
      expect(text).not.toMatch(/PRISM_UNKNOWN|fatal:/);
    } finally {
      built.session.close();
      await client.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
