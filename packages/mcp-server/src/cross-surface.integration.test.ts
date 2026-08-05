import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Prism } from "@repo-prism/core";
import type { PrismWorkspace } from "@repo-prism/core";
import { typicalRepository, type Fixture } from "@repo-prism/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismMcpServer, type PrismMcpServer } from "./server.js";

/**
 * The same question, asked three ways, must come back with the same answer.
 *
 * ADR-0004 says every surface goes through Core and none of them reimplements
 * analysis. Nothing enforced that: MCP and CLI each build their own request and
 * shape their own output, so either could drift into answering a subtly
 * different question — a different default, a filter applied on one side only,
 * a rounded number — and every test would still pass, because each surface was
 * only ever checked against itself.
 *
 * This is the test M-052 existed to make possible and M-037 owes it (Phase 3.4).
 */

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliBinary = join(packageDir, "..", "cli", "dist", "cli.js");

let fixture: Fixture;
let workspace: PrismWorkspace;
let mcp: PrismMcpServer;
let client: Client;

beforeAll(async () => {
  fixture = await typicalRepository();

  const opened = Prism.create().openRepository(fixture.root);
  if (!opened.ok) throw new Error(`openRepository: ${opened.error.message}`);
  workspace = opened.value;
  const indexed = await workspace.index();
  if (!indexed.ok) throw new Error(`index: ${indexed.error.message}`);

  mcp = createPrismMcpServer({ workspaceRoot: fixture.root });
  client = new Client({ name: "cross-surface", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    mcp.server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
}, 180_000);

afterAll(async () => {
  workspace?.close();
  mcp?.session.close();
  await client?.close();
  await fixture?.cleanup();
});

async function viaMcp(
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = (await client.callTool({ name, arguments: args })) as {
    content?: { text?: string }[];
    isError?: boolean;
  };
  const text = response.content?.[0]?.text ?? "";
  expect(response.isError, `${name} failed: ${text}`).not.toBe(true);
  return JSON.parse(text) as Record<string, unknown>;
}

function viaCli(
  args: readonly string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliBinary, ...args, "--workspace", fixture.root, "--json"],
      { env: { ...process.env, NO_COLOR: "1" } },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

type CliEnvelope =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string } };

/**
 * `--json` wraps every answer in `{ ok, data }` and every failure in
 * `{ ok: false, error }`, so the payload to compare lives one level down.
 */
async function cliJson(
  args: readonly string[],
): Promise<Record<string, unknown>> {
  const run = await viaCli(args);
  expect(run.code, `cli ${args.join(" ")} failed: ${run.stderr}`).toBe(0);
  const envelope = JSON.parse(run.stdout) as CliEnvelope;
  expect(envelope.ok, `cli ${args.join(" ")} reported failure`).toBe(true);
  return (envelope as { ok: true; data: Record<string, unknown> }).data;
}

describe("Core, MCP and CLI agree", () => {
  it("on the health score", async () => {
    const core = await workspace.getHealth();
    expect(core.ok).toBe(true);
    if (!core.ok) return;

    const mcpAnswer = await viaMcp("repository_health");
    const cliAnswer = await cliJson(["health"]);

    expect(mcpAnswer.score).toBe(core.value.score);
    expect(cliAnswer.score).toBe(core.value.score);
  });

  it("on dependency cycles", async () => {
    const core = workspace.getCycles();
    expect(core.ok).toBe(true);
    if (!core.ok) return;

    // The fixture contains a deliberate two-file cycle, so agreement here is
    // agreement about something rather than three empty lists matching.
    expect(core.value.length).toBeGreaterThan(0);

    const mcpAnswer = await viaMcp("dependency_cycles");
    const cliAnswer = await cliJson(["cycles"]);

    const normalise = (cycles: unknown): string =>
      JSON.stringify(
        (cycles as string[][])
          .map((c) => [...c].sort())
          .sort((a, b) => (a.join() < b.join() ? -1 : 1)),
      );

    // The two surfaces spell the payload key differently — MCP's bounded-list
    // envelope calls it `items`, the CLI calls it `cycles`. See the test below,
    // which pins that difference deliberately.
    expect(normalise(mcpAnswer.items)).toBe(normalise(core.value));
    expect(normalise(cliAnswer.cycles)).toBe(normalise(core.value));
  });

  it("on the blast radius of a file", async () => {
    const target = "src/features/cart.ts";
    const core = await workspace.blastRadius({ kind: "file", id: target });
    expect(core.ok).toBe(true);
    if (!core.ok) return;

    const mcpAnswer = await viaMcp("blast_radius", {
      kind: "file",
      id: target,
    });
    const cliAnswer = await cliJson(["blast", target]);

    expect(mcpAnswer.risk).toBe(core.value.risk);
    expect(cliAnswer.risk).toBe(core.value.risk);

    const corePaths = core.value.affectedFiles.map((f) => f.path).sort();
    const paths = (answer: Record<string, unknown>): string[] =>
      (answer.affectedFiles as { path: string }[]).map((f) => f.path).sort();

    expect(paths(mcpAnswer)).toEqual(corePaths);
    expect(paths(cliAnswer)).toEqual(corePaths);
  });

  it("on the repository DNA", async () => {
    const core = await workspace.getDna();
    expect(core.ok).toBe(true);
    if (!core.ok) return;

    const mcpAnswer = await viaMcp("repository_dna");
    const cliAnswer = await cliJson(["dna"]);

    const language = (answer: Record<string, unknown>): unknown =>
      (answer.languages as { id: string }[])[0]?.id;

    expect(language(mcpAnswer)).toBe(core.value.languages[0]?.id);
    expect(language(cliAnswer)).toBe(core.value.languages[0]?.id);
    expect(mcpAnswer.frameworks).toEqual(core.value.frameworks);
    expect(cliAnswer.frameworks).toEqual(core.value.frameworks);
  });

  it("on which tests a change would affect", async () => {
    const target = "src/features/cart.ts";
    const core = await workspace.testImpact({ kind: "file", id: target });
    expect(core.ok).toBe(true);
    if (!core.ok) return;

    const mcpAnswer = await viaMcp("test_impact", { kind: "file", id: target });
    const cliAnswer = await cliJson(["test-impact", target]);

    const coreTests = core.value.tests.map((t) => t.path).sort();
    expect(coreTests).toContain("src/features/cart.test.ts");

    const tests = (answer: Record<string, unknown>): string[] =>
      (answer.tests as { path: string }[]).map((t) => t.path).sort();

    expect(tests(mcpAnswer)).toEqual(coreTests);
    expect(tests(cliAnswer)).toEqual(coreTests);
  });
});

/**
 * Where the surfaces genuinely differ, on purpose or by accident.
 *
 * Pinned rather than hidden behind a lenient assertion: an inconsistency nobody
 * has written down is one that gets discovered by a user. Each of these is a
 * decision for the owner — unify the spelling and break a documented consumer,
 * or keep both and document the difference — and until that decision is made,
 * this test makes sure the situation does not quietly get worse.
 */
describe("known differences between surfaces", () => {
  it("wrap list answers in differently-named envelopes", async () => {
    const mcpAnswer = await viaMcp("dependency_cycles");
    const cliAnswer = await cliJson(["cycles"]);

    // MCP bounds every list for agent context budgets and reports what it left
    // out; the CLI bounds with --limit and names the payload after the command.
    expect(Object.keys(mcpAnswer).sort()).toEqual([
      "items",
      "limit",
      "totalCount",
      "truncated",
    ]);
    expect(Object.keys(cliAnswer).sort()).toEqual([
      "cycles",
      "totalCount",
      "truncated",
    ]);
  });

  it("agree on the values inside those envelopes", async () => {
    const mcpAnswer = await viaMcp("dependency_cycles");
    const cliAnswer = await cliJson(["cycles"]);

    expect(mcpAnswer.totalCount).toBe(cliAnswer.totalCount);
    expect(mcpAnswer.truncated).toBe(cliAnswer.truncated);
    expect(mcpAnswer.items).toEqual(cliAnswer.cycles);
  });
});

describe("surfaces refuse the same things", () => {
  it("all three report a missing file as not found rather than as an empty result", async () => {
    const missing = "src/does/not/exist.ts";

    const core = await workspace.blastRadius({ kind: "file", id: missing });
    expect(core.ok).toBe(false);
    if (core.ok) return;
    expect(core.error.code).toBe("PRISM_NOT_FOUND");

    const mcpResponse = (await client.callTool({
      name: "blast_radius",
      arguments: { kind: "file", id: missing },
    })) as { isError?: boolean };
    expect(mcpResponse.isError).toBe(true);

    // The CLI must fail loudly in both channels a script might read. A zero
    // exit, or an `ok: true` envelope with an empty affected list, would both
    // let a caller conclude the change is safe.
    const cli = await viaCli(["blast", missing]);
    expect(cli.code).not.toBe(0);
    const envelope = JSON.parse(cli.stdout) as CliEnvelope;
    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error.code).toBe(core.error.code);
  });
});
