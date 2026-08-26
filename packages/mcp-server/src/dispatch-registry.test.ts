import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DISPATCH_TOOLS } from "./dispatch-registry.js";
import { createPrismMcpServer, type PrismMcpServer } from "./server.js";

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

  it("keeps Intelligence tools and list_jobs, hides start_job", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("blast_radius");
    expect(names).toContain("list_jobs");
    expect(names).toContain("remember");
    expect(names).not.toContain("start_job");
    expect(names).not.toContain("start_my_day");
  });
});
