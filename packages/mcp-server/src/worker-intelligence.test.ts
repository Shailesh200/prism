import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WORKER_INTELLIGENCE_TOOLS } from "@repo-prism/dispatch";
import {
  WORKER_TOOLS,
  consoleCaller,
  findConsole,
  registerWorkerIntelligence,
  workerToolNames,
} from "./worker-intelligence.js";

async function hubHome(record: unknown): Promise<NodeJS.ProcessEnv> {
  const home = await mkdtemp(join(tmpdir(), "prism-hub-"));
  await mkdir(join(home, "hub"), { recursive: true });
  await writeFile(join(home, "hub", "hub.json"), JSON.stringify(record));
  return { PRISM_HUB_HOME: join(home, "hub") };
}

const healthy = (() =>
  new Response("{}", { status: 200 })) as unknown as typeof fetch;
const refused = (() => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

/** A Console that answers one method and records what it was sent. */
function console_(answer: unknown): {
  fetchImpl: typeof fetch;
  sent: Record<string, unknown>[];
} {
  const sent: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ id: "w1", ok: true, data: answer }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

describe("findConsole", () => {
  it("accepts a record only after the daemon answers", async () => {
    const env = await hubHome({ port: 17330, token: "tok", pid: 1 });
    await expect(findConsole({ env, fetchImpl: healthy })).resolves.toEqual({
      port: 17330,
      token: "tok",
    });
  });

  it("treats a stale record as no Console", async () => {
    // The record is a claim about a process that may have been killed since.
    const env = await hubHome({ port: 17330, token: "tok", pid: 1 });
    await expect(
      findConsole({ env, fetchImpl: refused }),
    ).resolves.toBeUndefined();
  });

  it("ignores a record with no token, rather than calling unauthenticated", async () => {
    const env = await hubHome({ port: 17330, pid: 1 });
    await expect(
      findConsole({ env, fetchImpl: healthy }),
    ).resolves.toBeUndefined();
  });

  it("reports no Console when there is no record at all", async () => {
    await expect(
      findConsole({
        env: { PRISM_HUB_HOME: join(tmpdir(), "prism-absent-hub") },
        fetchImpl: healthy,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("consoleCaller", () => {
  it("sends the workspace and a bearer token with every call", async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response(JSON.stringify({ id: "w1", ok: true, data: 1 }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const call = consoleCaller({ port: 1, token: "tok" }, "/repo", fetchImpl);
    await call("symbols", { query: "x" });
    const headers = seen[0]?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(String(seen[0]?.body))).toMatchObject({
      method: "symbols",
      workspace: "/repo",
      query: "x",
    });
  });

  it("turns a refusal into an error rather than a silent undefined", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ id: "w1", ok: false, error: "no index" }), {
        status: 200,
      })) as unknown as typeof fetch;
    const call = consoleCaller({ port: 1, token: "t" }, "/repo", fetchImpl);
    await expect(call("symbols", {})).rejects.toThrow("no index");
  });

  it("reports an HTTP failure with its status", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const call = consoleCaller({ port: 1, token: "t" }, "/repo", fetchImpl);
    await expect(call("symbols", {})).rejects.toThrow("401");
  });
});

describe("the worker tool set", () => {
  it("matches the list the worker backends allowlist from", () => {
    // Claude enumerates `mcp__prism__<name>`; a tool registered but not listed
    // there is invisible, and one listed but not registered never resolves.
    expect([...workerToolNames()].sort()).toEqual(
      [...WORKER_INTELLIGENCE_TOOLS].sort(),
    );
  });

  it("says in every description that answers are the host checkout", () => {
    // A worker reading its own worktree would be misled without this: the
    // Console indexes the host tree, so "what did I just write" is stale.
    for (const tool of WORKER_TOOLS) {
      expect(tool.description).toMatch(/host checkout/);
    }
  });

  it("slices one impact call rather than making four", async () => {
    const bundle = {
      ok: true,
      value: {
        blast: { risk: "low" },
        rename: { sites: [] },
        safeDelete: { safe: true },
        testImpact: { suites: ["a"] },
      },
    };
    const { fetchImpl, sent } = console_(bundle);
    const call = consoleCaller({ port: 1, token: "t" }, "/repo", fetchImpl);

    const blast = WORKER_TOOLS.find((t) => t.name === "blast_radius");
    await expect(
      blast?.run(call, { kind: "file", id: "src/a.ts" }),
    ).resolves.toEqual({
      blast: { risk: "low" },
      testImpact: { suites: ["a"] },
    });

    const del = WORKER_TOOLS.find((t) => t.name === "safe_delete");
    await expect(
      del?.run(call, { kind: "file", id: "src/a.ts" }),
    ).resolves.toEqual({ safe: true });

    expect(sent.map((row) => row.method)).toEqual(["impact", "impact"]);
    expect(sent[0]?.target).toMatchObject({ intent: "edit" });
    expect(sent[1]?.target).toMatchObject({ intent: "delete" });
  });

  it("surfaces the Console's own refusal of an impact target", async () => {
    const { fetchImpl } = console_({ ok: false, error: "unknown symbol" });
    const call = consoleCaller({ port: 1, token: "t" }, "/repo", fetchImpl);
    const blast = WORKER_TOOLS.find((t) => t.name === "blast_radius");
    await expect(
      blast?.run(call, { kind: "symbol", id: "nope" }),
    ).rejects.toThrow("unknown symbol");
  });
});

describe("registration", () => {
  it("registers nothing when no Console answers", async () => {
    // The fallback that must not exist: starting a local Core here is the
    // second index ADR-0041 was written to prevent.
    const server = { registerTool: vi.fn() };
    const count = await registerWorkerIntelligence(server as never, {
      workspaceRoot: "/repo",
      env: { PRISM_HUB_HOME: join(tmpdir(), "prism-absent-hub") },
      fetchImpl: healthy,
    });
    expect(count).toBe(0);
    expect(server.registerTool).not.toHaveBeenCalled();
  });

  it("registers the full set when a Console is reachable", async () => {
    const server = { registerTool: vi.fn() };
    const count = await registerWorkerIntelligence(server as never, {
      workspaceRoot: "/repo",
      link: { port: 17330, token: "tok" },
      fetchImpl: healthy,
    });
    expect(count).toBe(WORKER_TOOLS.length);
    expect(server.registerTool.mock.calls.map((call) => call[0])).toEqual([
      ...WORKER_INTELLIGENCE_TOOLS,
    ]);
  });

  it("returns a tool error instead of throwing out of the MCP handler", async () => {
    const server = { registerTool: vi.fn() };
    await registerWorkerIntelligence(server as never, {
      workspaceRoot: "/repo",
      link: { port: 17330, token: "tok" },
      fetchImpl: refused,
    });
    const handler = server.registerTool.mock.calls[0]?.[2] as (
      args: Record<string, unknown>,
    ) => Promise<{ isError?: boolean; content: { text: string }[] }>;
    const answer = await handler({ kind: "file", id: "a.ts" });
    expect(answer.isError).toBe(true);
    expect(answer.content[0]?.text).toMatch(/could not answer/i);
  });
});
