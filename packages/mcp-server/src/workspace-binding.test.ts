import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createPrismMcpServer } from "./server.js";
import {
  createWorkspaceBinding,
  pickWorkspaceFromHints,
} from "./workspace-binding.js";

describe("workspace binding", () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "prism-mcp-bind-"));
    temps.push(dir);
    return dir;
  }

  function gitDir(): string {
    const root = tempDir();
    writeFileSync(join(root, ".git"), "gitdir: /somewhere");
    return root;
  }

  it("prefers a hint that sits in a git repository", () => {
    const plain = tempDir();
    const repo = gitDir();
    expect(pickWorkspaceFromHints([plain, repo])).toBe(repo);
    expect(pickWorkspaceFromHints([repo, plain])).toBe(repo);
  });

  it("accepts file:// root URIs", () => {
    const repo = gitDir();
    expect(pickWorkspaceFromHints([pathToFileURL(repo).href])).toBe(repo);
  });

  it("ignores Cursor Library/Containers sandbox folders", () => {
    const repo = gitDir();
    expect(
      pickWorkspaceFromHints([
        "/Users/me/Library/Containers/com.todesktop.230313mzl4w4u92/Data",
        repo,
      ]),
    ).toBe(repo);
    expect(
      pickWorkspaceFromHints([
        "/Users/me/Library/Containers/com.todesktop.230313mzl4w4u92/Data",
      ]),
    ).toBeUndefined();
  });

  it("walks from a nested workspace folder up to the git root", () => {
    const repo = gitDir();
    const nested = join(repo, "apps", "web");
    mkdirSync(nested, { recursive: true });
    expect(pickWorkspaceFromHints([nested])).toBe(repo);
  });

  it("lets MCP roots replace a non-repo launch cwd", () => {
    const launch = tempDir();
    const repo = gitDir();
    const binding = createWorkspaceBinding({ path: launch, source: "cwd" });
    expect(binding.applyHints([repo])).toBe(true);
    expect(binding.current()).toBe(repo);
    expect(binding.source()).toBe("mcp roots");
  });

  it("does not override an explicit --workspace / PRISM_WORKSPACE", () => {
    const chosen = tempDir();
    const repo = gitDir();
    const binding = createWorkspaceBinding({
      path: chosen,
      source: "argument",
    });
    expect(binding.locked).toBe(true);
    expect(binding.applyHints([repo])).toBe(false);
    expect(binding.current()).toBe(chosen);
  });

  it("lets a later MCP root replace a wrong launch cwd", () => {
    const launch = tempDir();
    const repo = gitDir();
    const binding = createWorkspaceBinding({ path: launch, source: "cwd" });
    expect(binding.applyHints([repo])).toBe(true);
    expect(binding.current()).toBe(repo);
    expect(binding.source()).toBe("mcp roots");
  });
});

describe("MCP roots rebind the live workspace", () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "prism-mcp-roots-"));
    temps.push(dir);
    return dir;
  }

  function gitDir(): string {
    const root = tempDir();
    writeFileSync(join(root, ".git"), "gitdir: /somewhere");
    return root;
  }

  async function connectWithRoots(
    handler: () => Promise<{ roots: Array<{ uri: string }> }>,
  ) {
    const launch = tempDir();
    const built = createPrismMcpServer({
      workspaceRoot: launch,
      workspaceSource: "cwd",
    });
    const client = new Client(
      { name: "roots-test", version: "0.0.0" },
      { capabilities: { roots: { listChanged: true } } },
    );
    client.setRequestHandler(ListRootsRequestSchema, handler);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      built.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return { built, client };
  }

  it("switches onto the client's open git folder after initialize", async () => {
    const repo = gitDir();
    const { built, client } = await connectWithRoots(async () => ({
      roots: [{ uri: pathToFileURL(repo).href }],
    }));
    try {
      await built.applyClientRoots();
      expect(built.binding.current()).toBe(repo);
      expect(built.binding.source()).toBe("mcp roots");
    } finally {
      built.session.close();
      await client.close();
    }
  });

  it("retries after a transient listRoots failure instead of latching", async () => {
    const repo = gitDir();
    let failures = 1;
    const { built, client } = await connectWithRoots(async () => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("timed out");
      }
      return { roots: [{ uri: pathToFileURL(repo).href }] };
    });
    try {
      await built.applyClientRoots();
      expect(built.binding.source()).toBe("cwd");
      await built.applyClientRoots();
      expect(built.binding.current()).toBe(repo);
      expect(built.binding.source()).toBe("mcp roots");
    } finally {
      built.session.close();
      await client.close();
    }
  });

  it("stops asking once the client proves it has no roots capability", async () => {
    const launch = tempDir();
    const built = createPrismMcpServer({
      workspaceRoot: launch,
      workspaceSource: "cwd",
    });
    // No roots capability — listRoots rejects inside the SDK.
    const client = new Client({ name: "no-roots", version: "0.0.0" }, {});
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    let calls = 0;
    const original = built.server.server.listRoots.bind(built.server.server);
    built.server.server.listRoots = (async (
      ...args: Parameters<typeof original>
    ) => {
      calls += 1;
      return original(...args);
    }) as typeof original;
    try {
      await Promise.all([
        built.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      await built.applyClientRoots();
      await built.applyClientRoots();
      expect(calls).toBe(1);
      expect(built.binding.source()).toBe("cwd");
    } finally {
      built.session.close();
      await client.close();
    }
  });

  it("re-resolves when the client notifies roots/list_changed", async () => {
    const first = gitDir();
    const second = gitDir();
    let current = first;
    const { built, client } = await connectWithRoots(async () => ({
      roots: [{ uri: pathToFileURL(current).href }],
    }));
    try {
      await built.applyClientRoots();
      expect(built.binding.current()).toBe(first);

      current = second;
      await client.notification({ method: "notifications/roots/list_changed" });

      const deadline = Date.now() + 2000;
      while (built.binding.current() !== second) {
        if (Date.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(built.binding.current()).toBe(second);
      expect(built.binding.source()).toBe("mcp roots");
    } finally {
      built.session.close();
      await client.close();
    }
  });
});
