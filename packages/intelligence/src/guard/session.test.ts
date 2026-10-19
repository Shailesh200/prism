import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { buildDependencyGraph } from "../dependency/build.js";
import {
  checkGuardSession,
  looksLikeSameSymbol,
  reexportFamily,
} from "./session.js";

function snapshot(files: IndexedFile[]): IndexSnapshot {
  return {
    repoId: "repo:m072",
    rootPath: "/tmp/m072",
    indexedAt: "2026-09-16T00:00:00.000Z",
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

describe("checkGuardSession > orphan", () => {
  it("flags a session file nothing imports", () => {
    const snap = snapshot([
      file("src/used.ts", {
        symbols: [
          { name: "used", kind: "function", start: 0, end: 10, exported: true },
        ],
      }),
      file("src/orphan.ts", {
        symbols: [
          {
            name: "orphan",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
      }),
      file("src/app.ts", {
        symbols: [{ name: "app", kind: "variable", start: 0, end: 10 }],
        imports: [{ source: "./used.ts", specifiers: ["used"] }],
        references: [{ name: "used", kind: "call", start: 20, end: 24 }],
      }),
    ]);
    const flags = checkGuardSession({
      snapshot: snap,
      sessionPaths: ["src/used.ts", "src/orphan.ts", "src/app.ts"],
      dependencyGraph: buildDependencyGraph(snap).graph,
    });
    expect(flags.get("src/orphan.ts")?.some((f) => f.kind === "orphan")).toBe(
      true,
    );
    expect(flags.get("src/used.ts")?.some((f) => f.kind === "orphan")).toBe(
      undefined,
    );
  });

  it("never flags a test file as orphan", () => {
    const snap = snapshot([
      file("src/thing.test.ts", {
        symbols: [
          {
            name: "thing",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
      }),
    ]);
    const flags = checkGuardSession({
      snapshot: snap,
      sessionPaths: ["src/thing.test.ts"],
      dependencyGraph: buildDependencyGraph(snap).graph,
    });
    expect(flags.has("src/thing.test.ts")).toBe(false);
  });
});

describe("checkGuardSession > duplicate", () => {
  it("does not flag a barrel re-export as a duplicate of its own source (B3 false alarm)", () => {
    const snap = snapshot([
      file("src/predicate/isBlob.ts", {
        symbols: [
          {
            name: "isBlob",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "isBlob", kind: "name" }],
      }),
      file("src/predicate/index.ts", {
        symbols: [
          {
            name: "isBlob",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "isBlob", kind: "name", source: "./isBlob.ts" }],
      }),
    ]);
    const graph = buildDependencyGraph(snap).graph;
    expect(
      reexportFamily(graph, "src/predicate/index.ts").has(
        "src/predicate/isBlob.ts",
      ),
    ).toBe(true);
    const flags = checkGuardSession({
      snapshot: snap,
      sessionPaths: ["src/predicate/index.ts"],
      dependencyGraph: graph,
    });
    expect(
      flags
        .get("src/predicate/index.ts")
        ?.some((f) => f.kind === "duplicate") ?? false,
    ).toBe(false);
  });

  it("keeps siblings behind one barrel comparable (re-export family is directional)", () => {
    const sym = (name: string) => ({
      name,
      kind: "function" as const,
      start: 0,
      end: 20,
      exported: true,
    });
    const snap = snapshot([
      file("src/array/dropRightWhile.ts", {
        symbols: [sym("dropRightWhile")],
        exports: [{ name: "dropRightWhile", kind: "name" }],
      }),
      file("src/compat/dropRightWhile.ts", {
        symbols: [sym("dropRightWhile")],
        exports: [{ name: "dropRightWhile", kind: "name" }],
      }),
      file("src/index.ts", {
        symbols: [],
        exports: [
          {
            name: "dropRightWhile",
            kind: "name",
            source: "./array/dropRightWhile.ts",
          },
          {
            name: "compatDropRightWhile",
            kind: "name",
            source: "./compat/dropRightWhile.ts",
          },
        ],
      }),
    ]);
    const graph = buildDependencyGraph(snap).graph;
    const family = reexportFamily(graph, "src/compat/dropRightWhile.ts");
    expect(family.has("src/index.ts")).toBe(true);
    expect(family.has("src/array/dropRightWhile.ts")).toBe(false);
  });

  it("flags a new export that looks like an existing one elsewhere", () => {
    const snap = snapshot([
      file("src/cache/lruCache.ts", {
        symbols: [
          {
            name: "lruCache",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "lruCache", kind: "name" }],
      }),
      file("src/users/newCache.ts", {
        symbols: [
          {
            name: "lruCacheForUsers",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "lruCacheForUsers", kind: "name" }],
      }),
    ]);
    const flags = checkGuardSession({
      snapshot: snap,
      sessionPaths: ["src/users/newCache.ts"],
      dependencyGraph: buildDependencyGraph(snap).graph,
    });
    expect(
      flags.get("src/users/newCache.ts")?.some((f) => f.kind === "duplicate"),
    ).toBe(true);
  });

  it("stops checking after a bounded number of session symbols (perf regression guard)", () => {
    // A 47-file session against this repo's own knowledge graph once blocked
    // the whole process for 40+ seconds (M-073 live incident): scoreReuse
    // rescans every exported symbol in the repo, once per session symbol
    // checked, with nothing bounding how many session symbols get checked.
    // This proves the fix behaviourally — checking stops after
    // MAX_DUPLICATE_CHECKS symbols — rather than by wall clock, which is
    // exactly the kind of assertion that flakes under a loaded CI runner.
    const NOISE_COUNT = 40; // exhausts the cap before any of these can match
    const PAST_CAP_COUNT = 5; // positioned after the cap; must be unreachable
    const files = [
      ...Array.from({ length: NOISE_COUNT }, (_, i) =>
        file(`src/users/noise${i}.ts`, {
          symbols: [
            {
              name: `noiseSymbol${i}`,
              kind: "function",
              start: 0,
              end: 20,
              exported: true,
            },
          ],
          exports: [{ name: `noiseSymbol${i}`, kind: "name" }],
        }),
      ),
      ...Array.from({ length: PAST_CAP_COUNT }, (_, i) => [
        file(`src/lib/pastCapSource${i}.ts`, {
          symbols: [
            {
              name: `pastCapMarker${i}`,
              kind: "function",
              start: 0,
              end: 20,
              exported: true,
            },
          ],
          exports: [{ name: `pastCapMarker${i}`, kind: "name" }],
        }),
        file(`src/users/pastCap${i}.ts`, {
          symbols: [
            {
              name: `pastCapMarker${i}Duplicate`,
              kind: "function",
              start: 0,
              end: 20,
              exported: true,
            },
          ],
          exports: [{ name: `pastCapMarker${i}Duplicate`, kind: "name" }],
        }),
      ]).flat(),
    ];
    const snap = snapshot(files);
    // Noise first, then the obvious-duplicate files — so the cap exhausts
    // on noise before the checker ever reaches a file that should match.
    const sessionPaths = [
      ...Array.from(
        { length: NOISE_COUNT },
        (_, i) => `src/users/noise${i}.ts`,
      ),
      ...Array.from(
        { length: PAST_CAP_COUNT },
        (_, i) => `src/users/pastCap${i}.ts`,
      ),
    ];
    const flags = checkGuardSession({
      snapshot: snap,
      sessionPaths,
      dependencyGraph: buildDependencyGraph(snap).graph,
    });
    for (let i = 0; i < PAST_CAP_COUNT; i += 1) {
      expect(
        flags
          .get(`src/users/pastCap${i}.ts`)
          ?.some((f) => f.kind === "duplicate"),
      ).toBe(false);
    }
  });

  it("does not flag two symbols that only share a generic word (live false-positive: fetchDna/fetchHealth)", () => {
    const snap = snapshot([
      file("src/client/fetch-dna.ts", {
        symbols: [
          {
            name: "fetchDna",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
        exports: [{ name: "fetchDna", kind: "name" }],
      }),
      file("src/client/fetch-health.ts", {
        symbols: [
          {
            name: "fetchHealth",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
        exports: [{ name: "fetchHealth", kind: "name" }],
      }),
    ]);
    const flags = checkGuardSession({
      snapshot: snap,
      sessionPaths: ["src/client/fetch-health.ts"],
      dependencyGraph: buildDependencyGraph(snap).graph,
    });
    expect(
      flags
        .get("src/client/fetch-health.ts")
        ?.some((f) => f.kind === "duplicate"),
    ).toBe(false);
  });

  it("does not flag two unrelated symbol names", () => {
    const snap = snapshot([
      file("src/a.ts", {
        symbols: [
          {
            name: "fetchUser",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
        exports: [{ name: "fetchUser", kind: "name" }],
      }),
      file("src/b.ts", {
        symbols: [
          {
            name: "renderWidget",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
        exports: [{ name: "renderWidget", kind: "name" }],
      }),
    ]);
    const flags = checkGuardSession({
      snapshot: snap,
      sessionPaths: ["src/b.ts"],
      dependencyGraph: buildDependencyGraph(snap).graph,
    });
    expect(flags.get("src/b.ts")?.some((f) => f.kind === "duplicate")).toBe(
      false,
    );
  });
});

describe("duplicate flags: name-overlap noise (website round)", () => {
  const sym = (name: string) => ({
    name,
    kind: "function" as const,
    start: 0,
    end: 20,
    exported: true,
  });
  it("one common word inside a longer name is not a copy", () => {
    expect(looksLikeSameSymbol("metadata", "pageMetadata")).toBe(false);
    expect(looksLikeSameSymbol("AdminPage", "Page")).toBe(false);
    expect(looksLikeSameSymbol("lruCache", "lruCacheForUsers")).toBe(true);
    expect(looksLikeSameSymbol("formatDate", "formatdate")).toBe(true);
  });

  it("a framework route's exports are never compared", () => {
    const snap = snapshot([
      file("app/a/page.tsx", {
        symbols: [sym("generateStaticParams")],
        exports: [{ name: "generateStaticParams", kind: "name" }],
      }),
      file("app/b/page.tsx", {
        symbols: [sym("generateStaticParams")],
        exports: [{ name: "generateStaticParams", kind: "name" }],
      }),
    ]);
    const flags = checkGuardSession({
      snapshot: snap,
      sessionPaths: ["app/b/page.tsx"],
      dependencyGraph: buildDependencyGraph(snap).graph,
      entryRoles: new Map([
        ["app/a/page.tsx", "route"],
        ["app/b/page.tsx", "route"],
      ]),
    });
    expect(
      flags.get("app/b/page.tsx")?.some((f) => f.kind === "duplicate") ?? false,
    ).toBe(false);
  });
});

describe("guard: only what the change adds (round 5, B3 noise)", () => {
  const dupSnap = () =>
    snapshot([
      file("src/compat/predicate/isBoolean.ts", {
        symbols: [
          {
            name: "isBoolean",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "isBoolean", kind: "name" }],
      }),
      file("src/predicate/index.ts", {
        symbols: [
          {
            name: "isBoolean",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
          {
            name: "isEmptyObject",
            kind: "function",
            start: 30,
            end: 50,
            exported: true,
          },
        ],
        exports: [
          { name: "isBoolean", kind: "name" },
          { name: "isEmptyObject", kind: "name" },
        ],
      }),
    ]);

  it("a symbol the file already had at HEAD is not a duplicate (es-toolkit 50339c32)", () => {
    const snap = dupSnap();
    const input = {
      snapshot: snap,
      sessionPaths: ["src/predicate/index.ts"],
      dependencyGraph: buildDependencyGraph(snap).graph,
    };
    // Without HEAD the old behaviour stands: the barrel's isBoolean is flagged.
    expect(
      checkGuardSession(input)
        .get("src/predicate/index.ts")
        ?.some((f) => f.kind === "duplicate"),
    ).toBe(true);
    const head = "export { isBoolean } from './isBoolean';\n";
    expect(
      checkGuardSession({ ...input, headSource: () => head })
        .get("src/predicate/index.ts")
        ?.some((f) => f.kind === "duplicate"),
    ).toBeFalsy();
    // A new file has no HEAD version: its symbols are all new, still checked.
    expect(
      checkGuardSession({ ...input, headSource: () => null })
        .get("src/predicate/index.ts")
        ?.some((f) => f.kind === "duplicate"),
    ).toBe(true);
  });

  it("flags a new export with no return type in a JSR package (hono 6a0607a9)", () => {
    const snap = snapshot([
      file("src/utils/url.ts"),
      file("src/utils/url.test.ts"),
    ]);
    const before =
      "const tryDecodeURI = (str: string) => tryDecode(str, decodeURI)\n";
    const after = `export ${before}`;
    const input = {
      snapshot: snap,
      sessionPaths: ["src/utils/url.ts", "src/utils/url.test.ts"],
      dependencyGraph: buildDependencyGraph(snap).graph,
      headSource: () => before,
      readSource: () => after,
    };
    const slow = (
      over: Partial<Parameters<typeof checkGuardSession>[0]>,
      path = "src/utils/url.ts",
    ) =>
      (checkGuardSession({ ...input, ...over }).get(path) ?? []).filter(
        (f) => f.kind === "slow-type",
      );
    const flags = slow({ jsrPackage: true });
    expect(flags).toEqual([
      expect.objectContaining({ kind: "slow-type", provenance: "measured" }),
    ]);
    expect(flags[0]!.detail).toContain('"tryDecodeURI"');
    expect(slow({ jsrPackage: true }, "src/utils/url.test.ts")).toEqual([]);
    // Not a JSR package, or HEAD unreadable: no slow-type flag.
    expect(slow({ jsrPackage: false })).toEqual([]);
    expect(slow({ jsrPackage: true, headSource: () => undefined })).toEqual([]);
  });
});
