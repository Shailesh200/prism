import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DISPATCH_TOOLS, speakableBoardUrl } from "./dispatch-registry.js";
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

  it("speaks the tokenised Dashboard URL so a first visit is authorised", () => {
    expect(
      speakableBoardUrl({
        enabled: true,
        detail: "Jobs board is up.",
        url: "http://prismhq.localhost:17330/",
        dashboardUrl: "http://prismhq.localhost:17330/?token=session-token",
      }),
    ).toBe("http://prismhq.localhost:17331/?token=session-token");
  });

  it("falls back to the one Dashboard host", () => {
    expect(
      speakableBoardUrl({ enabled: true, detail: "Jobs board is up." }),
    ).toBe("http://prismhq.localhost:17331/");
  });

  it("omits the board link when the hub is explicitly off", () => {
    expect(
      speakableBoardUrl({ enabled: false, detail: "Jobs board is off." }),
    ).toBeUndefined();
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
      env: {
        PRISM_DISPATCH_ROLE: "worker",
        PRISM_HUB_HOME: join(root, "absent-hub"),
      },
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    await built.toolsReady;
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

  it("keeps list_jobs, hides start_job; intelligence stays off without a Console", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).not.toContain("blast_radius");
    expect(names).not.toContain("list_packages");
    expect(names).not.toContain("repository_health");
    expect(names).toContain("list_jobs");
    expect(names).toContain("remember");
    expect(names).not.toContain("start_job");
    expect(names).not.toContain("start_my_day");
    expect(names).not.toContain("init");
    expect(names).not.toContain("sleep");
    expect(names).not.toContain("wake");
  });
});

describe("worker role lists Console intelligence after toolsReady", () => {
  it("exposes list_packages before the client lists tools", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-worker-hub-"));
    const root = await mkdtemp(join(tmpdir(), "prism-worker-ready-"));
    await mkdir(join(home, "hub"), { recursive: true });
    await writeFile(
      join(home, "hub", "hub.json"),
      JSON.stringify({ port: 17330, token: "tok", pid: 1 }),
    );
    const fetchImpl = (async () =>
      new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const built = createPrismMcpServer({
      workspaceRoot: root,
      env: {
        PRISM_DISPATCH_ROLE: "worker",
        PRISM_HUB_HOME: join(home, "hub"),
      },
      fetchImpl,
    });
    await built.toolsReady;
    const client = new Client({ name: "worker-ready", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      built.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);
      expect(names).toContain("list_packages");
      expect(names).toContain("blast_radius");
      expect(names).not.toContain("start_job");
    } finally {
      built.session.close();
      await client.close();
      await rm(root, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("configure dispatchMode over MCP", () => {
  it("persists dispatchMode set through the registered tool schema", async () => {
    // The chat agent calls configure with flat args (dispatchMode at the top
    // level), so the field has to be in the tool inputSchema — otherwise the
    // MCP SDK strips it before the handler runs and the mode is stuck on ask,
    // which is what made Dispatch "always do inline".
    const root = await mkdtemp(join(tmpdir(), "prism-dispatch-mode-mcp-"));
    const built = createPrismMcpServer({ workspaceRoot: root });
    const client = new Client({ name: "mode-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      built.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const setResponse = (await client.callTool({
        name: "configure",
        arguments: { action: "set", dispatchMode: "auto" },
      })) as ToolResponse;
      expect(setResponse.isError).not.toBe(true);
      expect(setResponse.content?.[0]?.text ?? "").toContain(
        "dispatchMode=auto",
      );

      const getResponse = (await client.callTool({
        name: "configure",
        arguments: { action: "get" },
      })) as ToolResponse;
      expect(getResponse.content?.[0]?.text ?? "").toContain(
        "dispatchMode=auto",
      );
    } finally {
      built.session.close();
      await client.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("start_job workspace hint", () => {
  it("rebinds a container launch cwd onto the repo the agent passes", async () => {
    const launch = await mkdtemp(join(tmpdir(), "prism-dispatch-launch-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-dispatch-repo-"));
    await writeFile(join(repo, ".git"), "gitdir: /somewhere");
    const built = createPrismMcpServer({
      workspaceRoot: launch,
      workspaceSource: "cwd",
    });
    const client = new Client({ name: "hint-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      built.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      await client.callTool({
        name: "start_job",
        arguments: {
          title: "News highlight",
          prd: "Highlight HTML body",
          workspace: repo,
        },
      });
      expect(built.binding.current()).toBe(repo);
    } finally {
      built.session.close();
      await client.close();
      await rm(launch, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe("queue_finding (M-071 L2)", () => {
  it("delegates to the same start_job path once the finding passes schema", async () => {
    // Job-field construction (origin, parentFindingId, fingerprint, PRD) is
    // covered at the dispatch level (runtime.test.ts) with a mocked git/worker
    // so this suite does not spawn a real worker. Here we only prove the tool
    // is wired: a well-formed finding reaches start_job's own git check
    // (same spoken message and dashboard decoration as start_job) rather than
    // being rejected by queue_finding's own validation.
    const launch = await mkdtemp(join(tmpdir(), "prism-queue-finding-"));
    const built = createPrismMcpServer({ workspaceRoot: launch });
    const client = new Client({ name: "finding-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      built.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const response = (await client.callTool({
        name: "queue_finding",
        arguments: {
          finding: {
            id: "symbol:src/x.ts:foo:0",
            source: "unused_export",
            title: 'Unused export "foo" in src/x.ts',
            path: "src/x.ts",
            fingerprint: "fp-123",
          },
        },
      })) as ToolResponse;
      expect(response.isError).not.toBe(true);
      const text = response.content?.[0]?.text ?? "";
      expect(text).toMatch(/git repository/i);
    } finally {
      built.session.close();
      await client.close();
      await rm(launch, { recursive: true, force: true });
    }
  });

  it("refuses a finding missing the fields a report tool must have provided", async () => {
    const launch = await mkdtemp(join(tmpdir(), "prism-queue-finding-bad-"));
    const built = createPrismMcpServer({ workspaceRoot: launch });
    const client = new Client({ name: "finding-bad-test", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      built.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const response = (await client.callTool({
        name: "queue_finding",
        arguments: { finding: { title: "a made-up finding" } },
      })) as ToolResponse;
      expect(response.isError).toBe(true);
      expect(response.content?.[0]?.text ?? "").toMatch(/Required at finding/);
    } finally {
      built.session.close();
      await client.close();
      await rm(launch, { recursive: true, force: true });
    }
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
