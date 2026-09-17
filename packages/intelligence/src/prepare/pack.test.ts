import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { buildPrepareChange, tokenizeTask } from "./pack.js";

const M075 = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/m075-rationale",
);

function snapshot(files: IndexedFile[]): IndexSnapshot {
  return {
    repoId: "repo:m070",
    rootPath: "/tmp/m070",
    indexedAt: "2026-09-14T00:00:00.000Z",
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed: files.length,
      filesSkipped: 0,
      durationMs: 0,
    },
    warnings: [],
  };
}

function file(path: string, patch: Partial<IndexedFile> = {}): IndexedFile {
  return {
    path,
    pluginId: "typescript",
    contentHash: "h",
    status: "analyzed",
    symbols: [],
    imports: [],
    exports: [],
    references: [],
    diagnostics: [],
    ...patch,
  };
}

const users = snapshot([
  file("src/users/fetchUser.ts", {
    symbols: [
      {
        name: "fetchUser",
        kind: "function",
        start: 0,
        end: 40,
        exported: true,
      },
    ],
    exports: [{ name: "fetchUser", kind: "name" }],
  }),
  file("src/users/lruCache.ts", {
    symbols: [
      {
        name: "lruCache",
        kind: "function",
        start: 0,
        end: 30,
        exported: true,
      },
    ],
    exports: [{ name: "lruCache", kind: "name" }],
  }),
  file("src/users/fetchUser.test.ts", {
    symbols: [
      {
        name: "fetchUserTest",
        kind: "function",
        start: 0,
        end: 20,
        exported: true,
      },
    ],
    imports: [{ source: "./fetchUser.ts", specifiers: ["fetchUser"] }],
  }),
  file("src/other/fetchUser.ts", {
    symbols: [
      {
        name: "fetchUser",
        kind: "function",
        start: 0,
        end: 40,
        exported: true,
      },
    ],
    exports: [{ name: "fetchUser", kind: "name" }],
  }),
  file("src/routes/users/handler.ts", {
    symbols: [
      {
        name: "usersHandler",
        kind: "function",
        start: 0,
        end: 40,
        exported: true,
      },
    ],
    exports: [{ name: "usersHandler", kind: "name" }],
    imports: [
      { source: "express", specifiers: ["default"] },
      { source: "../../users/fetchUser.ts", specifiers: ["fetchUser"] },
    ],
  }),
  file("src/routes/health/handler.ts", {
    symbols: [
      {
        name: "healthHandler",
        kind: "function",
        start: 0,
        end: 40,
        exported: true,
      },
    ],
    exports: [{ name: "healthHandler", kind: "name" }],
    imports: [{ source: "express", specifiers: ["default"] }],
  }),
  file("src/app.ts", {
    symbols: [
      { name: "app", kind: "variable", start: 0, end: 10, exported: true },
    ],
    imports: [
      { source: "express", specifiers: ["default"] },
      {
        source: "./routes/users/handler.ts",
        specifiers: ["usersHandler"],
      },
      {
        source: "./routes/health/handler.ts",
        specifiers: ["healthHandler"],
      },
    ],
  }),
]);

describe("tokenizeTask", () => {
  it("stems caching to cache", () => {
    expect(tokenizeTask("add caching to fetchUser")).toContain("cache");
    expect(tokenizeTask("add caching to fetchUser")).toContain("fetch");
  });
});

describe("buildPrepareChange", () => {
  it("packs users feature files and tests for fetchUser caching", () => {
    const prep = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
      budget: 4000,
    });
    const paths = prep.pack.files.map((f) => f.path);
    expect(paths.some((p) => p.includes("src/users/"))).toBe(true);
    expect(prep.pack.tests.some((p) => p.includes("fetchUser.test"))).toBe(
      true,
    );
    expect(JSON.stringify(prep)).not.toContain("UNIQUE_M070_FILE_BODY_TOKEN");
  });

  it("does not silently pick a homonym seed", () => {
    const prep = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
    });
    expect(prep.ambiguous?.query).toBe("fetchUser");
    expect(prep.ambiguous?.candidates.length).toBeGreaterThan(1);
    expect(prep.ambiguous?.candidates.map((c) => c.path).sort()).toEqual(
      ["src/other/fetchUser.ts", "src/users/fetchUser.ts"].sort(),
    );
  });

  it("reuses lruCache and stays empty when none match", () => {
    const hit = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
    });
    expect(hit.reuse.some((r) => r.symbol === "lruCache")).toBe(true);
    expect(hit.reuseProvenance).toBe("heuristic");

    const emptySnap = snapshot([
      file("src/plain.ts", {
        symbols: [
          {
            name: "plain",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
        exports: [{ name: "plain", kind: "name" }],
      }),
    ]);
    const miss = buildPrepareChange({
      snapshot: emptySnap,
      task: "add caching to fetchUser",
    });
    expect(miss.reuse).toEqual([]);
    expect(miss.reuseProvenance).toBe("unavailable");
  });

  it("names the Express handler as canonical House Style", () => {
    const prep = buildPrepareChange({
      snapshot: users,
      task: "add an Express route",
      frameworks: ["express"],
    });
    expect(prep.conventions?.[0]?.path).toContain("routes/users");
    expect(prep.conventions?.[0]?.whyCanonical).toMatch(
      /handlers next to the route/,
    );
    expect(prep.conventionsProvenance).toBe("heuristic");
  });

  it("sets truncated when the budget is below the map weight", () => {
    const prep = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
      budget: 8,
    });
    expect(prep.pack.truncated).toBe(true);
    expect(prep.pack.totalCount).toBeGreaterThan(prep.pack.files.length);
  });

  it("leaves order and workingSet null", () => {
    const prep = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
    });
    expect(prep.order).toBeNull();
    expect(prep.workingSet).toBeNull();
  });

  it("includes a matching memory note for a pack path (M-075 M2)", () => {
    const prep = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
      memories: [
        {
          text: "keep fetchUser cache-free",
          symbol: "fetchUser",
          path: "src/users/fetchUser.ts",
        },
        { text: "unrelated", path: "src/never.ts" },
      ],
    });
    expect(prep.notes?.some((n) => n.source === "memory")).toBe(true);
    expect(prep.notes?.find((n) => n.source === "memory")?.text).toBe(
      "keep fetchUser cache-free",
    );
    expect(prep.notes?.some((n) => n.path === "src/never.ts")).toBe(false);
  });

  it("includes a rationale_for hit when an ADR names a pack file (M-075 A1)", () => {
    const snap = snapshot([
      file("src/users/fetchUser.ts", {
        symbols: [
          {
            name: "fetchUser",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "fetchUser", kind: "name" }],
      }),
      file("src/users/fetchUser.test.ts", {
        symbols: [
          {
            name: "fetchUserTest",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        imports: [{ source: "./fetchUser.ts", specifiers: ["fetchUser"] }],
      }),
      file("plans/adr/0001-fetch-user.md"),
    ]);
    const prep = buildPrepareChange({
      snapshot: { ...snap, rootPath: M075 },
      task: "add caching to fetchUser",
    });
    const adr = prep.notes?.find((n) => n.source === "rationale");
    expect(adr?.rationaleFor).toBe("plans/adr/0001-fetch-user.md");
    expect(adr?.path).toBe("src/users/fetchUser.ts");
  });
});
