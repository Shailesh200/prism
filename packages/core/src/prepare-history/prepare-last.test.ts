import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_WORK_ORDER, type PrepareChange } from "@repo-prism/shared";
import {
  PREPARE_HISTORY_LIMIT,
  readLastPrepareChange,
  readPrepareHistory,
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
    expect(last?.packFiles[0]?.symbols).toEqual(["fetchUser"]);
    expect(last?.packFiles[0]?.tokenWeight).toBe(12);
    expect(last?.packFiles[0]?.provenance).toBe("heuristic");
    expect(last?.reuse[0]?.symbol).toBe("lruCache");
    expect(last?.reuse[0]?.kind).toBe("function");
    expect(last?.reuse[0]?.score).toBe(0.7);
    expect(last?.reuse[0]?.provenance).toBe("heuristic");
    expect(last?.ambiguous?.query).toBe("fetchUser");
    expect(JSON.stringify(last)).not.toContain("UNIQUE_M070_FILE_BODY_TOKEN");
  });
});

describe("prepare history (M-074 Console polish)", () => {
  it("keeps every run for a workspace, newest first", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-prep-home-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    await writeLastPrepareChange(
      "/tmp/m070-repo",
      { ...sample(), generatedAt: "2026-09-14T00:00:00.000Z" },
      env,
    );
    await writeLastPrepareChange(
      "/tmp/m070-repo",
      {
        ...sample(),
        pack: { ...sample().pack, task: "second task" },
        generatedAt: "2026-09-15T00:00:00.000Z",
      },
      env,
    );
    const history = await readPrepareHistory("/tmp/m070-repo", env);
    expect(history).toHaveLength(2);
    expect(history[0]?.task).toBe("second task");
    expect(history[1]?.task).toBe("add caching to fetchUser");
    expect((await readLastPrepareChange("/tmp/m070-repo", env))?.task).toBe(
      "second task",
    );
  });

  it("caps history at PREPARE_HISTORY_LIMIT, dropping the oldest runs", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-prep-home-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    for (let i = 0; i < PREPARE_HISTORY_LIMIT + 3; i += 1) {
      await writeLastPrepareChange(
        "/tmp/m070-cap",
        {
          ...sample(),
          pack: { ...sample().pack, task: `task-${i}` },
          generatedAt: new Date(2026, 8, 1 + i).toISOString(),
        },
        env,
      );
    }
    const history = await readPrepareHistory("/tmp/m070-cap", env);
    expect(history).toHaveLength(PREPARE_HISTORY_LIMIT);
    expect(history[0]?.task).toBe(`task-${PREPARE_HISTORY_LIMIT + 2}`);
  });

  it("keeps each workspace's history separate", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-prep-home-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    await writeLastPrepareChange("/tmp/repo-a", sample(), env);
    const historyB = await readPrepareHistory("/tmp/repo-b", env);
    expect(historyB).toHaveLength(0);
  });
});
