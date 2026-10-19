import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { createPrismMcpServer, type PrismMcpServer } from "./server.js";
import { DEFAULT_TOOL_NAMES, TOOL_NAMES } from "./tools.js";

/**
 * The default surface is smaller than the full pack. That is only safe if
 * nothing Prism ships tells an agent to call a tool it cannot see.
 */

const plugin = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugin",
);
/** Tool names deleted in 2.0 (§0.4), from the one list the repo-wide check uses. */
const DELETED = deletedToolNames();
function deletedToolNames(): string[] {
  const list = JSON.parse(
    readFileSync(
      join(plugin, "..", "..", "scripts", "deleted-names.json"),
      "utf8",
    ),
  ) as { names: string[] };
  return list.names.filter((name) => /^[a-z]+(?:_[a-z]+)+$/.test(name));
}
const KNOWN = new Set([...TOOL_NAMES, ...DELETED]);

function namedTools(text: string): string[] {
  return [...new Set(text.match(/\b[a-z][a-z_]{3,}\b/g) ?? [])].filter((word) =>
    KNOWN.has(word),
  );
}

let instance: PrismMcpServer;
let client: Client;
let root = "";
let registered = new Set<string>();

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "prism-surface-"));
  // An empty Prism home: no `extraTools[]`, so only the default nine.
  const prismHome = await mkdtemp(join(tmpdir(), "prism-surface-home-"));
  instance = createPrismMcpServer({
    workspaceRoot: root,
    env: { ...process.env, PRISM_HOME: prismHome },
  });
  client = new Client({ name: "surface-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([instance.server.connect(b), client.connect(a)]);
  registered = new Set((await client.listTools()).tools.map((t) => t.name));
});

afterAll(async () => {
  instance?.session.close();
  await client?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

describe("default MCP surface", () => {
  it("registers every current tool", () => {
    expect([...registered].sort()).toEqual([...TOOL_NAMES].sort());
    expect([...registered].sort()).toEqual([...DEFAULT_TOOL_NAMES].sort());
  });

  it("registers every tool the instructions name", () => {
    const missing = namedTools(SERVER_INSTRUCTIONS).filter(
      (t) => !registered.has(t),
    );
    expect(missing).toEqual([]);
  });

  it("registers every tool a shipped skill or command names", () => {
    const files = [
      ...readdirSync(join(plugin, "skills")).map((id) =>
        join(plugin, "skills", id, "SKILL.md"),
      ),
      ...readdirSync(join(plugin, "commands"))
        .filter((f) => f.endsWith(".md"))
        .map((f) => join(plugin, "commands", f)),
    ];
    const missing: string[] = [];
    for (const file of files) {
      for (const tool of namedTools(readFileSync(file, "utf8"))) {
        if (!registered.has(tool))
          missing.push(`${file.split("/plugin/")[1]}: ${tool}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("registers every tool a prompt names", async () => {
    const { prompts } = await client.listPrompts();
    const missing: string[] = [];
    for (const prompt of prompts) {
      const args = Object.fromEntries(
        (prompt.arguments ?? []).map((arg) => [
          arg.name,
          arg.name === "path" ? "src/a.ts" : "",
        ]),
      );
      const result = await client.getPrompt({
        name: prompt.name,
        arguments: args,
      });
      for (const message of result.messages) {
        if (message.content.type !== "text") continue;
        for (const tool of namedTools(message.content.text)) {
          if (!registered.has(tool)) missing.push(`${prompt.name}: ${tool}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
