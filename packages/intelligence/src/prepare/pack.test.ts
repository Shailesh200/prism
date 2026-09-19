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

  it("stems plural near-misses so user/users and list/lists match", () => {
    const tokens = tokenizeTask("list users");
    expect(tokens).toContain("user");
    expect(tokens).toContain("users");
    expect(tokens).toContain("list");
    expect(tokenizeTask("lists")).toContain("list");
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

  it("fills a work order and leaves workingSet null (M-076)", () => {
    const prep = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
    });
    expect(prep.order).not.toBeNull();
    expect(prep.order.advisory).toBe(true);
    expect(prep.order.hookArmed).toBe(false);
    expect(prep.workingSet).toBeNull();
  });

  it("marks vendor and generated paths off-limits (M-076 O1)", () => {
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
      file("vendor/legacy.ts", {
        symbols: [
          {
            name: "legacy",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "legacy", kind: "name" }],
      }),
      file("src/generated/types.ts"),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "add caching to fetchUser",
    });
    expect(prep.order.offLimits.map((r) => r.path).sort()).toEqual(
      ["src/generated/types.ts", "vendor/legacy.ts"].sort(),
    );
    expect(
      prep.order.offLimits.find((r) => r.path === "vendor/legacy.ts")?.reason,
    ).toBe("vendor");
    expect(
      prep.order.offLimits.find((r) => r.path.startsWith("src/generated"))
        ?.reason,
    ).toBe("generated");
  });

  it("needs sign-off on high blast fan-in or many owners (M-076 O1)", () => {
    const prep = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
      gitFiles: [
        {
          path: "src/users/fetchUser.ts",
          lastCommit: {
            sha: "abc",
            author: "a",
            date: "2026-09-14T00:00:00.000Z",
            message: "x",
          },
          commits: 12,
          additions: 0,
          deletions: 0,
          lastAdditions: 0,
          lastDeletions: 0,
          contributors: [
            { author: "a", commits: 4, additions: 0, deletions: 0 },
            { author: "b", commits: 4, additions: 0, deletions: 0 },
            { author: "c", commits: 4, additions: 0, deletions: 0 },
          ],
          recent: [],
          weeks: [],
          recency: 0,
        },
      ],
    });
    expect(prep.order.needsSignOff).toContain("src/users/fetchUser.ts");
    expect(prep.order.inScope).not.toContain("src/users/fetchUser.ts");
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

  it("resolves seeds from a lowercase task", () => {
    const snap = snapshot([
      file("src/auth/login-screen.tsx", {
        symbols: [
          {
            name: "LoginForm",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "LoginForm", kind: "name" }],
      }),
      file("src/auth/session.ts", {
        symbols: [
          {
            name: "session",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "session", kind: "name" }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "fix login screen",
    });
    expect(prep.pack.files.map((f) => f.path)).toContain(
      "src/auth/login-screen.tsx",
    );
  });

  it("resolves a pasted path as a seed", () => {
    const snap = snapshot([
      file("packages/ui/src/DateRangePicker.tsx", {
        symbols: [
          {
            name: "Picker",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "Picker", kind: "name" }],
      }),
      file("src/other/plain.ts", {
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
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "packages/ui/src/DateRangePicker.tsx",
    });
    expect(prep.pack.files.map((f) => f.path)).toContain(
      "packages/ui/src/DateRangePicker.tsx",
    );
  });

  it("packs a path-named file with no identifier overlap in the body", () => {
    const snap = snapshot([
      file("src/tooltip.ts", {
        symbols: [
          {
            name: "Tip",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "Tip", kind: "name" }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "fix the tooltip",
    });
    expect(prep.pack.files.map((f) => f.path)).toContain("src/tooltip.ts");
    expect(prep.pack.files[0]?.why.some((w) => /path matches/.test(w))).toBe(
      true,
    );
  });

  it("packs an ownership-only sibling of a seed that has no name hit", () => {
    const snap = snapshot([
      file("app/login-form.ts", {
        symbols: [
          {
            name: "LoginForm",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "LoginForm", kind: "name" }],
      }),
      file("app/session-store.ts", {
        symbols: [
          {
            name: "sessionStore",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "sessionStore", kind: "name" }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "fix LoginForm",
      gitFiles: [
        {
          path: "app/session-store.ts",
          lastCommit: {
            sha: "abc",
            author: "a",
            date: "2026-09-14T00:00:00.000Z",
            message: "x",
          },
          commits: 8,
          additions: 0,
          deletions: 0,
          lastAdditions: 0,
          lastDeletions: 0,
          contributors: [
            { author: "a", commits: 8, additions: 0, deletions: 0 },
          ],
          recent: [],
          weeks: [],
          recency: 0,
        },
      ],
    });
    const paths = prep.pack.files.map((f) => f.path);
    expect(paths).toContain("app/login-form.ts");
    expect(paths).toContain("app/session-store.ts");
    expect(
      prep.pack.files
        .find((f) => f.path === "app/session-store.ts")
        ?.why.includes("owned seed home"),
    ).toBe(true);
  });

  it("packs the owned home for a seed when ownership alone sits under the threshold", () => {
    const snap = snapshot([
      file("src/auth/login.ts", {
        symbols: [
          {
            name: "login",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "login", kind: "name" }],
      }),
      file("src/copy/login.ts", {
        symbols: [
          {
            name: "login",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "login", kind: "name" }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "fix login",
      gitFiles: [
        {
          path: "src/auth/login.ts",
          lastCommit: {
            sha: "abc",
            author: "a",
            date: "2026-09-14T00:00:00.000Z",
            message: "x",
          },
          commits: 10,
          additions: 0,
          deletions: 0,
          lastAdditions: 0,
          lastDeletions: 0,
          contributors: [
            { author: "a", commits: 10, additions: 0, deletions: 0 },
          ],
          recent: [],
          weeks: [],
          recency: 0,
        },
      ],
    });
    const paths = prep.pack.files.map((f) => f.path);
    expect(paths).toContain("src/auth/login.ts");
    expect(paths).not.toContain("src/copy/login.ts");
  });

  it("ranks CSS, config, and docs when the task implies UI or styling", () => {
    const snap = snapshot([
      file("src/login/LoginScreen.tsx", {
        symbols: [
          {
            name: "LoginScreen",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "LoginScreen", kind: "name" }],
      }),
      file("src/login/login.css", {
        pluginId: null,
        status: "skipped_unsupported",
      }),
      file("src/login/README.md", {
        pluginId: null,
        status: "skipped_unsupported",
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "fix login screen layout",
    });
    const paths = prep.pack.files.map((f) => f.path);
    expect(paths).toContain("src/login/LoginScreen.tsx");
    expect(paths).toContain("src/login/login.css");
    expect(paths).toContain("src/login/README.md");
  });

  it("discovers a nearby stem-matched test outside the colocated folder", () => {
    const snap = snapshot([
      file("packages/ui/src/DateRangePicker.tsx", {
        symbols: [
          {
            name: "DateRangePicker",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "DateRangePicker", kind: "name" }],
      }),
      file("packages/ui/date-range.test.ts", {
        symbols: [
          {
            name: "dateRangeTest",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        imports: [
          {
            source: "./src/DateRangePicker.tsx",
            specifiers: ["DateRangePicker"],
          },
        ],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "fix DateRangePicker",
    });
    expect(prep.pack.tests).toContain("packages/ui/date-range.test.ts");
  });

  it("recommends feature-overlap reuse without an exact name-token hit", () => {
    const snap = snapshot([
      file("src/billing/createInvoice.ts", {
        symbols: [
          {
            name: "createInvoice",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "createInvoice", kind: "name" }],
      }),
      file("src/billing/formatMoney.ts", {
        symbols: [
          {
            name: "formatMoney",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "formatMoney", kind: "name" }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "extend createInvoice",
    });
    expect(prep.reuse.some((r) => r.symbol === "formatMoney")).toBe(true);
    expect(prep.reuse.some((r) => r.symbol === "createInvoice")).toBe(false);
    expect(
      prep.reuse.find((r) => r.symbol === "formatMoney")?.evidence,
    ).toMatch(/feature/i);
  });

  it("treats user/users stem near-miss as a reuse name match", () => {
    const snap = snapshot([
      file("src/app/page.ts", {
        symbols: [
          {
            name: "Page",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "Page", kind: "name" }],
      }),
      file("src/lib/listUsers.ts", {
        symbols: [
          {
            name: "listUsers",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "listUsers", kind: "name" }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "show a list of users on Page",
    });
    expect(prep.pack.files.map((f) => f.path)).toContain("src/app/page.ts");
    expect(prep.reuse.some((r) => r.symbol === "listUsers")).toBe(true);
  });

  it("does not recommend vendor or generated paths for reuse", () => {
    const snap = snapshot([
      file("src/cache/lruCache.ts", {
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
      file("vendor/cache/createCache.ts", {
        symbols: [
          {
            name: "createCache",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "createCache", kind: "name" }],
      }),
      file("src/generated/cacheTypes.ts", {
        symbols: [
          {
            name: "cacheTypes",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "cacheTypes", kind: "name" }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "add caching",
    });
    expect(prep.reuse.map((r) => r.path)).not.toContain(
      "vendor/cache/createCache.ts",
    );
    expect(prep.reuse.map((r) => r.path)).not.toContain(
      "src/generated/cacheTypes.ts",
    );
    expect(prep.reuse.some((r) => r.symbol === "lruCache")).toBe(true);
  });

  it("names a Next route-handler as House Style without Express", () => {
    const snap = snapshot([
      file("app/api/users/route.ts", {
        symbols: [
          {
            name: "GET",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "GET", kind: "name" }],
        imports: [{ source: "next/server", specifiers: ["NextResponse"] }],
      }),
      file("app/api/health/route.ts", {
        symbols: [
          {
            name: "GET",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "GET", kind: "name" }],
        imports: [{ source: "next/server", specifiers: ["NextResponse"] }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "add a route handler",
      frameworks: ["next"],
    });
    const hit = prep.conventions?.find((c) => c.patternId === "route-handler");
    expect(hit?.path).toMatch(/app\/api\//);
    expect(hit?.whyCanonical).toMatch(/handlers next to the route/);
    expect(prep.conventionsProvenance).toBe("heuristic");
  });

  it("names a screen, colocated test, and worker as House Style", () => {
    const snap = snapshot([
      file("src/dashboard/login-view.tsx", {
        symbols: [
          {
            name: "LoginView",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "LoginView", kind: "name" }],
      }),
      file("src/lib/math.ts", {
        symbols: [
          {
            name: "add",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
        exports: [{ name: "add", kind: "name" }],
      }),
      file("src/lib/math.test.ts", {
        symbols: [
          {
            name: "addTest",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
        imports: [{ source: "./math.ts", specifiers: ["add"] }],
      }),
      file("src/workers/email-worker.ts", {
        symbols: [
          {
            name: "processEmailJob",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "processEmailJob", kind: "name" }],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "add a screen worker and tests",
    });
    expect(
      prep.conventions?.some(
        (c) => c.patternId === "screen" && c.path.includes("login-view"),
      ),
    ).toBe(true);
    expect(
      prep.conventions?.some(
        (c) => c.patternId === "colocated-test" && c.path.includes("math.test"),
      ),
    ).toBe(true);
    expect(
      prep.conventions?.some(
        (c) => c.patternId === "worker" && c.path.includes("email-worker"),
      ),
    ).toBe(true);
    expect(prep.conventionsProvenance).toBe("heuristic");
  });
});
