import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismWorkspace } from "@repo-prism/core";
import { describe, expect, it } from "vitest";
import {
  EMPTY_WORK_ORDER,
  budgetFor,
  fitToBudget,
  type PrepareChange,
} from "@repo-prism/shared";
import { serialiseForMcp } from "../tool-registry.js";
import { prepareChange } from "./prepare.js";

const fixtureFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m070-envelope",
  "src",
  "users",
  "fetchUser.ts",
);

const BODY = "UNIQUE_M070_FILE_BODY_TOKEN";

const pack: PrepareChange = {
  pack: {
    task: "add caching to fetchUser",
    files: [
      {
        path: "src/users/fetchUser.ts",
        symbols: ["fetchUser"],
        signatures: [],
        why: ["feature users"],
        tokenWeight: 12,
        confidence: "medium" as const,
        provenance: "heuristic",
      },
    ],
    tokenEstimate: 12,
    tests: ["src/users/fetchUser.test.ts"],
    truncated: false,
    totalCount: 1,
  },
  reuse: [
    {
      path: "src/users/lruCache.ts",
      symbol: "lruCache",
      kind: "function",
      score: 0.7,
      evidence: "name overlaps task",
      provenance: "heuristic",
    },
  ],
  conventions: [],
  order: EMPTY_WORK_ORDER,
  workingSet: null,
  generatedAt: "2026-09-14T00:00:00.000Z",
  indexIndexedAt: "2026-09-14T00:00:00.000Z",
  reuseProvenance: "heuristic",
  conventionsProvenance: "unavailable",
  ambiguous: {
    query: "fetchUser",
    candidates: [
      { path: "src/users/fetchUser.ts", symbol: "fetchUser" },
      { path: "src/other/fetchUser.ts", symbol: "fetchUser" },
    ],
  },
};

describe("prepare_change MCP (M-070)", () => {
  it("serialises pack JSON without fixture file bodies", async () => {
    const source = await readFile(fixtureFile, "utf8");
    expect(source).toContain(BODY);
    const json = serialiseForMcp(pack);
    expect(json).not.toContain(BODY);
    expect(json).toContain("src/users/fetchUser.ts");
  });

  it("hosts with no prompt hook: the Prism line, the lens once per session, then receipt", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-prepare-lens-"));
    const root = mkdtempSync(join(tmpdir(), "prism-prepare-root-"));
    try {
      const env = { ...process.env, PRISM_HOME: home };
      const workspace = {
        prepareChange: async () => ({ ok: true as const, value: pack }),
        getIndex: () => ({ ok: false as const }),
      } as unknown as PrismWorkspace;
      const called = await prepareChange.call(
        { workspace, workspaceRoot: root, env },
        { task: "add caching to fetchUser" },
      );
      expect(called.ok).toBe(true);
      if (!called.ok) return;
      // The daemon may run `call`; only the agent's own server knows the host.
      expect("lens" in (called.value as object)).toBe(false);
      const present = (
        task: string,
        sessionId: string | undefined,
        hostEnv: NodeJS.ProcessEnv = env,
        tools: readonly string[] = ["prepare_change", "receipt"],
      ) =>
        prepareChange.present!(
          called.value,
          { task, ...(sessionId ? { sessionId } : {}) },
          { workspaceRoot: root, env: hostEnv, tools: new Set(tools) },
        ) as Promise<Record<string, unknown>>;

      const first = await present("add caching to fetchUser", "s1");
      const json = serialiseForMcp(
        fitToBudget(first, budgetFor("prepare_change")).value,
      );
      expect(
        json.startsWith(
          '{"prism":"Prism · Dev lens + no sure file (read before editing)","lens":{"name":"Dev","steps":"You are the Dev lens',
        ),
      ).toBe(true);
      expect(json).toMatch(/smallest complete change/);
      expect(first.finish).toBe(
        "After editing, call receipt and report its verdict in one line.",
      );

      const again = await present("add caching to fetchUser", "s1");
      expect(again.prism).toBe("Prism · no sure file (read before editing)");
      expect("lens" in again).toBe(false);
      const wider = await present("add caching everywhere", "s1");
      expect(wider.prism).toMatch(/^Prism · Dev lens \+ /);

      // No session id: once per server process.
      expect("lens" in (await present("add caching", undefined))).toBe(true);
      expect("lens" in (await present("add caching", undefined))).toBe(false);

      const risky = await present("remove the confirm guard", "s2");
      expect(risky.plan).toMatch(/^Risky change \(safety check\)/);
      expect(risky.prism).toMatch(/\+ plan cue \(safety check\)$/);

      const noReceipt = await present("add caching", "s3", env, [
        "prepare_change",
      ]);
      expect("finish" in noReceipt).toBe(false);

      // Claude: its prompt hook already showed the line and the lens.
      const hooked = await present("add caching", "s4", {
        ...env,
        PRISM_PROMPT_HOOK: "1",
      });
      expect(hooked).toBe(called.value);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});
