/**
 * receipt-tool-on (Arc, PR 1): `PRISM_EXTRA_TOOLS` merges with config.json
 * `extraTools`; unknown names warn, never crash; the `initialize`
 * instructions name `receipt` only when it is on.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECEIPT_INSTRUCTION,
  SERVER_INSTRUCTIONS,
  serverInstructions,
} from "./instructions.js";
import { createPrismMcpServer } from "./server.js";
import { extraToolsFromEnv, mergeExtraTools, selectTools } from "./tools.js";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function home(config?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "prism-extra-tools-"));
  dirs.push(dir);
  if (config !== undefined)
    writeFileSync(join(dir, "config.json"), JSON.stringify(config));
  return dir;
}

async function initialize(env: NodeJS.ProcessEnv) {
  const built = createPrismMcpServer({
    workspaceRoot: tmpdir(),
    workspaceSource: "argument",
    workspaceLocked: true,
    env,
  });
  const client = new Client({ name: "extra-tools-test", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    built.server.connect(serverSide),
    client.connect(clientSide),
  ]);
  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  const instructions = client.getInstructions() ?? "";
  await client.close();
  built.session.close();
  return { tools, instructions };
}

describe("PRISM_EXTRA_TOOLS", () => {
  it("is a comma-separated list; blanks and spaces are dropped", () => {
    expect(extraToolsFromEnv({ PRISM_EXTRA_TOOLS: " receipt , ,foo" })).toEqual(
      ["receipt", "foo"],
    );
    expect(extraToolsFromEnv({})).toEqual([]);
  });

  it("merges with config.json extraTools, each name once", () => {
    expect(
      mergeExtraTools(["receipt"], { PRISM_EXTRA_TOOLS: "receipt" }),
    ).toEqual(["receipt"]);
    expect(mergeExtraTools([], { PRISM_EXTRA_TOOLS: "receipt" })).toEqual([
      "receipt",
    ]);
  });

  it("an unknown name is reported, not fatal", () => {
    const selection = selectTools(
      mergeExtraTools([], { PRISM_EXTRA_TOOLS: "receipt,bogus" }),
    );
    expect(selection.unknownExtraTools).toEqual(["bogus"]);
    expect(selection.tools.map((tool) => tool.name)).toContain("receipt");
  });

  it("the server registers receipt from the env alone, warns on an unknown name, and says to call it", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const on = await initialize({
      PRISM_HOME: home(),
      PRISM_DAEMON: "0",
      PRISM_EXTRA_TOOLS: "receipt,bogus",
    });
    expect(on.tools).toContain("receipt");
    expect(on.instructions).toContain(RECEIPT_INSTRUCTION);
    expect(
      stderr.mock.calls.some(([line]) =>
        String(line).includes("unknown extraTools ignored: bogus"),
      ),
    ).toBe(true);
  });

  it("config.json and the env together; without either, no receipt and no receipt line", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const both = await initialize({
      PRISM_HOME: home({ extraTools: ["receipt"] }),
      PRISM_DAEMON: "0",
      PRISM_EXTRA_TOOLS: "receipt",
    });
    expect(both.tools.filter((name) => name === "receipt")).toEqual([
      "receipt",
    ]);
    const off = await initialize({ PRISM_HOME: home(), PRISM_DAEMON: "0" });
    expect(off.tools).not.toContain("receipt");
    expect(off.instructions).toBe(SERVER_INSTRUCTIONS);
  });
});

describe("serverInstructions", () => {
  it("adds the receipt line only when the tool is on, and stays under 1k", () => {
    expect(serverInstructions({ receipt: false })).toBe(SERVER_INSTRUCTIONS);
    const on = serverInstructions({ receipt: true });
    expect(on.endsWith(RECEIPT_INSTRUCTION)).toBe(true);
    expect(RECEIPT_INSTRUCTION).toMatch(/after you change code, call receipt/i);
    expect(on.length).toBeLessThan(1000);
  });
});
