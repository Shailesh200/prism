import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMPTY_WORK_ORDER, type PrepareChange } from "@repo-prism/shared";
import { serialiseForMcp } from "../tool-registry.js";

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
        why: ["feature users"],
        tokenWeight: 12,
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
});
