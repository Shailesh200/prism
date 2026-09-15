import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PrepareChange } from "@repo-prism/shared";
import {
  readLastPrepareChange,
  writeLastPrepareChange,
} from "./prepare-last.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) =>
      rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 40,
      }),
    ),
  );
});

function sample(): PrepareChange {
  return {
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
    order: null,
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
}

describe("prepare-last persist (M-070)", () => {
  it("round-trips a summary without file bodies", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-prep-home-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    const prep = sample();
    await writeLastPrepareChange("/tmp/m070-repo", prep, env);
    const last = await readLastPrepareChange("/tmp/m070-repo", env);
    expect(last?.task).toBe("add caching to fetchUser");
    expect(last?.packFiles[0]?.path).toBe("src/users/fetchUser.ts");
    expect(last?.reuse[0]?.symbol).toBe("lruCache");
    expect(last?.ambiguous?.query).toBe("fetchUser");
    expect(JSON.stringify(last)).not.toContain("UNIQUE_M070_FILE_BODY_TOKEN");
  });
});
