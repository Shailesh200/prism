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
});

describe("MCP roots rebind the live workspace", () => {
  it("switches onto the client's open git folder after initialize", async () => {
    const launch = mkdtempSync(join(tmpdir(), "prism-mcp-launch-"));
    const repo = mkdtempSync(join(tmpdir(), "prism-mcp-repo-"));
    writeFileSync(join(repo, ".git"), "gitdir: /somewhere");
    const built = createPrismMcpServer({
      workspaceRoot: launch,
      workspaceSource: "cwd",
    });
    const client = new Client(
      { name: "roots-test", version: "0.0.0" },
      { capabilities: { roots: {} } },
    );
    client.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: [{ uri: pathToFileURL(repo).href }],
    }));
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([
        built.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      await built.applyClientRoots();
      expect(built.binding.current()).toBe(repo);
      expect(built.binding.source()).toBe("mcp roots");
    } finally {
      built.session.close();
      await client.close();
      rmSync(launch, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
