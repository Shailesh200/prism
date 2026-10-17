import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import {
  buildPrepareChange,
  subjectsOfTest,
  testsFor,
  tokenizeTask,
} from "./pack.js";

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

  it("a capital that only starts a sentence is not a named symbol (round 3)", () => {
    const sym = (name: string, kind: string) => ({
      name,
      kind,
      start: 0,
      end: 10,
      exported: true,
    });
    const snap = snapshot([
      file("src/types.ts", {
        symbols: [sym("Next", "type")],
        exports: [{ name: "Next", kind: "name" }],
      }),
      file("src/utils/buffer.ts", {
        symbols: [sym("bufferToString", "function")],
        exports: [{ name: "bufferToString", kind: "name" }],
      }),
    ]);
    const named = (task: string) =>
      buildPrepareChange({ snapshot: snap, task, budget: 4000 })
        .pack.files.filter((f) => f.why.includes("named in task"))
        .map((f) => f.path);
    expect(
      named("Next: the tests below also fail now. Fix bufferToString."),
    ).toEqual(["src/utils/buffer.ts"]);
    expect(named("make the Next type accept a promise")).toContain(
      "src/types.ts",
    );
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
    expect(prep.conventions).toHaveLength(1);
    expect(prep.conventions?.[0]?.path).toContain("routes/users");
    expect(prep.conventions?.[0]?.whyCanonical).toMatch(
      /house style pointer:.*handlers next to the route/,
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

  it("a failing-test prompt seeds the test's own subject, not a barrel it imports (token fix 1)", () => {
    const sym = (name: string) => ({
      name,
      kind: "function",
      start: 0,
      end: 10,
      exported: true,
    });
    const barrel = Array.from({ length: 60 }, (_, i) => `fn${i}`);
    const snap = snapshot([
      file("src/array/chunk.ts", {
        symbols: [sym("chunk")],
        exports: [{ name: "chunk", kind: "name" }],
      }),
      file("src/compat/index.ts", {
        symbols: barrel.map(sym),
        exports: barrel.map((name) => ({ name, kind: "name" as const })),
      }),
      file("src/array/chunk.spec.ts", {
        imports: [
          { source: "./chunk.ts", specifiers: ["chunk"] },
          { source: "../compat/index.ts", specifiers: ["fn1"] },
        ],
      }),
    ]);
    expect(subjectsOfTest(snap, "src/array/chunk.spec.ts")).toEqual([
      "src/array/chunk.ts",
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "Tests listed below fail on this checkout. Fix the source so they pass.\n- src/array/chunk.spec.ts",
    });
    expect(prep.pack.files[0]?.path).toBe("src/array/chunk.ts");
    expect(prep.pack.tests).toContain("src/array/chunk.spec.ts");
    expect(prep.ambiguous).toBeNull();
  });

  it("does not take shared test helpers as a test's subject (round 2)", () => {
    const helperUsers = Array.from({ length: 6 }, (_, i) =>
      file(`src/compat/a${i}.spec.ts`, {
        imports: [
          { source: "./_internal/stubFour.ts", specifiers: ["stubFour"] },
        ],
      }),
    );
    const snap = snapshot([
      file("src/compat/_internal/stubFour.ts", {
        exports: [{ name: "stubFour", kind: "name" }],
      }),
      file("src/compat/object/updateWith.ts", {
        exports: [{ name: "updateWith", kind: "name" }],
      }),
      file("src/compat/object/set.ts", {
        exports: [{ name: "set", kind: "name" }],
      }),
      file("src/compat/object/get.ts", {
        exports: [{ name: "get", kind: "name" }],
      }),
      file("src/compat/object/has.ts", {
        exports: [{ name: "has", kind: "name" }],
      }),
      ...helperUsers,
      file("src/compat/proto.spec.ts", {
        imports: [
          { source: "./_internal/stubFour.ts", specifiers: ["stubFour"] },
          { source: "./object/updateWith.ts", specifiers: ["updateWith"] },
        ],
      }),
      file("src/compat/wide.spec.ts", {
        imports: [
          { source: "./object/updateWith.ts", specifiers: ["updateWith"] },
          { source: "./object/set.ts", specifiers: ["set"] },
          { source: "./object/get.ts", specifiers: ["get"] },
          { source: "./object/has.ts", specifiers: ["has"] },
        ],
      }),
    ]);
    // The helper is dropped; the one real subject stays.
    expect(subjectsOfTest(snap, "src/compat/proto.spec.ts")).toEqual([
      "src/compat/object/updateWith.ts",
    ]);
    // Four candidates and no same-name file: no guess.
    expect(subjectsOfTest(snap, "src/compat/wide.spec.ts")).toEqual([]);
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
    expect(prep.pack.files[0]?.why.some((w) => /matches tooltip/.test(w))).toBe(
      true,
    );
  });

  it("marks a clear top pick as the lead, and no lead among look-alikes (round 4)", () => {
    const exported = (path: string, name: string) =>
      file(path, {
        symbols: [
          { name, kind: "function", start: 0, end: 20, exported: true },
        ],
        exports: [{ name, kind: "name" }],
      });
    const snap = snapshot([
      exported("src/main/tray.ts", "createTray"),
      exported("src/main/heatmap.ts", "drawHeatmap"),
      exported("src/main/colors.ts", "palette"),
      exported("src/ui/menuBar.ts", "MenuBar"),
      exported("src/ui/menuList.ts", "MenuList"),
    ]);
    const clear = buildPrepareChange({
      snapshot: snap,
      task: "make the tray quieter",
    });
    expect(clear.pack.files[0]?.path).toBe("src/main/tray.ts");
    expect(clear.pack.files[0]?.lead).toBe(true);
    expect(clear.pack.files.filter((f) => f.lead)).toHaveLength(1);
    const close = buildPrepareChange({ snapshot: snap, task: "tidy the menu" });
    expect(close.pack.files.length).toBeGreaterThan(1);
    expect(close.pack.files.some((f) => f.lead)).toBe(false);
  });

  it("ownership alone does not pack an unrelated sibling (plan §5.1)", () => {
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
    expect(paths).not.toContain("app/session-store.ts");
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
    // Plan §5.1: equal IDF evidence; ownership only breaks the tie.
    expect(paths.indexOf("src/auth/login.ts")).toBeLessThan(
      paths.indexOf("src/copy/login.ts"),
    );
  });

  it("files are source only: CSS and docs never enter the pack (plan §5.1)", () => {
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
    expect(paths).toEqual(["src/login/LoginScreen.tsx"]);
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
    expect(prep.conventions).toHaveLength(1);
    expect(hit?.path).toMatch(/app\/api\//);
    expect(hit?.whyCanonical).toMatch(
      /house style pointer:.*handlers next to the route/,
    );
    expect(prep.conventionsProvenance).toBe("heuristic");
  });

  it("never points House Style at a fixture, test or generated route", () => {
    const handler = (path: string) =>
      file(path, {
        imports: [{ source: "express", specifiers: ["Router"] }],
      });
    const snap = snapshot([
      handler("packages/api/fixtures/demo/src/routes/users/handler.ts"),
      handler("packages/api/test/routes/users.ts"),
      handler("src/generated/routes/client.ts"),
      handler("src/routes/orders/handler.ts"),
      // The fixture is imported most, so it would rank first if counted.
      file("src/app.ts", {
        imports: [
          {
            source: "../packages/api/fixtures/demo/src/routes/users/handler.js",
            specifiers: ["users"],
          },
        ],
      }),
    ]);
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "add a route handler",
      frameworks: ["express"],
    });
    expect(prep.conventions?.map((c) => c.path)).toEqual([
      "src/routes/orders/handler.ts",
    ]);
  });

  it("keeps one House Style pointer when screen/test/worker exist (P2)", () => {
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
    // P2: one pointer only (first pattern in house-style order = screen here).
    expect(prep.conventions).toHaveLength(1);
    expect(prep.conventions?.[0]?.patternId).toBe("screen");
    expect(prep.conventions?.[0]?.path).toContain("login-view");
    expect(prep.conventions?.[0]?.whyCanonical).toMatch(/house style pointer:/);
    expect(prep.conventionsProvenance).toBe("heuristic");
  });
});

describe("prepare signatures (P2 PREP-S)", () => {
  const src = `export function fetchUser(id: string): User {
  return load(id);
}
`;
  const bigBody = "export function bigFn() {\n" + "  x();\n".repeat(50) + "}\n";
  const snap = snapshot([
    file("src/users/fetchUser.ts", {
      symbols: [
        {
          name: "fetchUser",
          kind: "function",
          start: 0,
          end: src.length,
          exported: true,
        },
      ],
      exports: [{ name: "fetchUser", kind: "name" }],
    }),
    file("src/users/big.ts", {
      symbols: [
        {
          name: "bigFn",
          kind: "function",
          start: 0,
          end: bigBody.length,
          exported: true,
        },
      ],
      exports: [{ name: "bigFn", kind: "name" }],
    }),
  ]);

  it("PREP-S1 no body > 40 lines in a pack", () => {
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "change bigFn in src/users/big.ts",
      sources: {
        "src/users/fetchUser.ts": src,
        "src/users/big.ts": bigBody,
      },
    });
    for (const f of prep.pack.files) {
      if (!f.body) continue;
      const lines = f.body.text.split(/\n/).length;
      expect(lines).toBeLessThanOrEqual(40);
    }
    const big = prep.pack.files.find((f) => f.path.includes("big.ts"));
    // Top-ranked may be big.ts; its body must be omitted (>40 lines).
    if (big && prep.pack.files[0]?.path === big.path) {
      expect(big.body).toBeUndefined();
    }
  });

  it("PREP-S2 every signature has a resolvable anchor", () => {
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "change fetchUser",
      sources: {
        "src/users/fetchUser.ts": src,
        "src/users/big.ts": bigBody,
      },
    });
    expect(prep.pack.files.length).toBeGreaterThan(0);
    // Only the top file carries signatures; the rest go by path (PREP-S4).
    expect(prep.pack.files[0]!.signatures.length).toBeGreaterThan(0);
    for (const f of prep.pack.files.slice(1)) {
      expect(f.signatures).toEqual([]);
    }
    for (const f of prep.pack.files) {
      for (const s of f.signatures) {
        expect(s.line).toBeGreaterThan(0);
        expect(s.signature.length).toBeGreaterThan(0);
        const source = f.path === "src/users/fetchUser.ts" ? src : bigBody;
        const lineText = source.split(/\n/)[s.line - 1] ?? "";
        expect(lineText.length).toBeGreaterThan(0);
      }
    }
  });

  it("PREP-S1 includes a short top-1 body", () => {
    const prep = buildPrepareChange({
      snapshot: snap,
      task: "change fetchUser",
      sources: {
        "src/users/fetchUser.ts": src,
        "src/users/big.ts": bigBody,
      },
    });
    const top = prep.pack.files[0];
    expect(top?.path).toContain("fetchUser");
    expect(top?.body?.name).toBe("fetchUser");
    expect(top?.body?.text).toContain("export function fetchUser");
    expect(top?.body?.text.split(/\n/).length ?? 99).toBeLessThanOrEqual(40);
  });
});

describe("pack budget counts signatures (B4 regression)", () => {
  const heavy = (path: string) =>
    file(path, {
      symbols: Array.from({ length: 20 }, (_, i) => ({
        name: `lambdaExport${i}`,
        kind: "function",
        start: 0,
        end: 1,
        exported: true,
      })),
    });
  const snap = snapshot(
    Array.from({ length: 8 }, (_, i) => heavy(`src/lambda/handler${i}.ts`)),
  );

  it("keeps files by path when their signatures no longer fit, within the cap", () => {
    const prep = buildPrepareChange({ snapshot: snap, task: "lambda handler" });
    const tokens = Math.ceil(Buffer.byteLength(JSON.stringify(prep)) / 4);
    expect(tokens).toBeLessThanOrEqual(2000);
    // Only the top file carries signatures; the rest are slim, so more fit.
    expect(prep.pack.files.length).toBeGreaterThanOrEqual(3);
    expect(prep.pack.files[0]!.signatures.length).toBeGreaterThan(0);
    expect(prep.pack.files.slice(1).every((f) => f.why.length > 0)).toBe(true);
  });

  it("caps the top file's signatures so a wide module leaves room for others", () => {
    const wide = file("src/lambda/handler.ts", {
      symbols: Array.from({ length: 80 }, (_, i) => ({
        name: `fn${i}`,
        kind: "function",
        start: 0,
        end: 1,
        exported: true,
      })),
    });
    const others = Array.from({ length: 6 }, (_, i) =>
      file(`src/lambda/handler-${i}.ts`, {
        symbols: [
          {
            name: `lambdaHandler${i}`,
            kind: "function",
            start: 0,
            end: 1,
            exported: true,
          },
        ],
      }),
    );
    const prep = buildPrepareChange({
      snapshot: snapshot([wide, ...others]),
      task: "fix the lambda handler in src/lambda/handler.ts",
    });
    const top = prep.pack.files[0]!;
    expect(top.path).toBe("src/lambda/handler.ts");
    expect(top.signatures.length).toBeGreaterThan(0);
    expect(top.signatures.length).toBeLessThan(80);
    // A quarter of the 65% file share of the 2,000-token default.
    expect(
      Math.ceil(Buffer.byteLength(JSON.stringify(top)) / 4),
    ).toBeLessThanOrEqual(325);
    expect(prep.pack.files.length).toBeGreaterThanOrEqual(4);
  });

  it("lists at most 8 symbols for a file below the top one (round 2)", () => {
    const top = file("src/lambda/handler.ts", {
      symbols: [
        {
          name: "lambdaHandler",
          kind: "function",
          start: 0,
          end: 1,
          exported: true,
        },
      ],
    });
    const wide = file("src/lambda/handler-types.ts", {
      symbols: Array.from({ length: 40 }, (_, i) => ({
        name: `Type${i}`,
        kind: "type",
        start: 0,
        end: 1,
        exported: true,
      })),
    });
    const prep = buildPrepareChange({
      snapshot: snapshot([top, wide]),
      task: "fix the lambda handler in src/lambda/handler.ts",
    });
    const slim = prep.pack.files.find((f) => f.path === wide.path)!;
    expect(slim.signatures).toEqual([]);
    expect(slim.symbols).toEqual(
      Array.from({ length: 8 }, (_, i) => `Type${i}`),
    );
  });
});

describe("tests for a file (round 4, CardWise)", () => {
  it("shared folders (services/api/src) do not make every test cover a file", () => {
    const snap = snapshot([
      file("services/api/src/modules/recs/recs.service.ts"),
      file(
        "services/api/src/modules/recs/__tests__/recs-history.service.test.ts",
      ),
      file("services/api/src/infra/mail/__tests__/verification-email.test.ts"),
      file("services/api/src/modules/auth/__tests__/auth.test.ts"),
    ]);
    expect(
      testsFor(snap, ["services/api/src/modules/recs/recs.service.ts"]),
    ).toEqual([
      "services/api/src/modules/recs/__tests__/recs-history.service.test.ts",
    ]);
  });
});

describe("tests order (round 4, CardWise)", () => {
  it("for one file, its own tests come before helpers and other modules' tests", () => {
    const impl = "src/modules/recs/recs.service.ts";
    const snap = snapshot([
      file(impl),
      file("src/modules/assistant/__tests__/assistant.service.test.ts", {
        imports: [{ source: "../../recs/recs.service", specifiers: ["R"] }],
      }),
      file("src/modules/recs/__tests__/fixtures.ts", {
        imports: [{ source: "../recs.service", specifiers: ["R"] }],
      }),
      file("src/modules/recs/__tests__/recs.service.test.ts", {
        imports: [{ source: "../recs.service", specifiers: ["R"] }],
      }),
    ]);
    expect(testsFor(snap, [impl])).toEqual([
      "src/modules/recs/__tests__/recs.service.test.ts",
      "src/modules/assistant/__tests__/assistant.service.test.ts",
      "src/modules/recs/__tests__/fixtures.ts",
    ]);
  });

  it("lists tests by the rank of the file they cover, not by name", () => {
    const snap = snapshot([
      file("src/modules/recs/recs.service.ts"),
      file("src/infra/mail/mailer.ts"),
      file("src/modules/recs/__tests__/recs.service.test.ts", {
        imports: [{ source: "../recs.service", specifiers: ["x"] }],
      }),
      file("src/infra/mail/__tests__/mailer.test.ts", {
        imports: [{ source: "../mailer", specifiers: ["y"] }],
      }),
    ]);
    expect(
      testsFor(snap, [
        "src/modules/recs/recs.service.ts",
        "src/infra/mail/mailer.ts",
      ]),
    ).toEqual([
      "src/modules/recs/__tests__/recs.service.test.ts",
      "src/infra/mail/__tests__/mailer.test.ts",
    ]);
  });
});

describe("prepare on a partial index (round 4, CardWise)", () => {
  it("flags the answer, keeps every pick low and names no lead", () => {
    const whole = buildPrepareChange({
      snapshot: users,
      task: "add caching to fetchUser",
      budget: 4000,
    });
    expect(whole.partialIndex).toBeUndefined();

    const partial = buildPrepareChange({
      snapshot: {
        ...users,
        warnings: [
          "partial index: analyzed 500 of 900 code files (top packages first)",
        ],
      },
      task: "add caching to fetchUser",
      budget: 4000,
    });
    expect(partial.partialIndex).toEqual({ analyzed: 500, total: 900 });
    expect(partial.pack.files.length).toBeGreaterThan(0);
    for (const f of partial.pack.files) {
      expect(f.confidence).toBe("low");
      expect(f.why).toContain("partial index");
    }
  });
});
