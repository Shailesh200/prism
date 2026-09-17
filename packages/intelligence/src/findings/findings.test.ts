import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import {
  computeFindingFingerprint,
  findingStillOpen,
  listDuplicateImplementationFindings,
  listUnusedExportFindings,
  listWrapperOverExistingFindings,
} from "./index.js";

function snapshot(files: IndexedFile[]): IndexSnapshot {
  return {
    repoId: "repo:m071",
    rootPath: "/tmp/m071",
    indexedAt: "2026-09-15T00:00:00.000Z",
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

const withUnusedExport = snapshot([
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
      { name: "lruCache", kind: "function", start: 0, end: 30, exported: true },
    ],
    exports: [{ name: "lruCache", kind: "name" }],
  }),
  file("src/app.ts", {
    symbols: [{ name: "app", kind: "variable", start: 0, end: 10 }],
    imports: [{ source: "./users/fetchUser.ts", specifiers: ["fetchUser"] }],
    references: [{ name: "fetchUser", kind: "call", start: 20, end: 29 }],
  }),
]);

const afterDeletingUnusedExport = snapshot([
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
  file("src/app.ts", {
    symbols: [{ name: "app", kind: "variable", start: 0, end: 10 }],
    imports: [{ source: "./users/fetchUser.ts", specifiers: ["fetchUser"] }],
    references: [{ name: "fetchUser", kind: "call", start: 20, end: 29 }],
  }),
]);

describe("computeFindingFingerprint", () => {
  it("is stable for the same source + path + title", () => {
    const a = computeFindingFingerprint({
      source: "unused_export",
      path: "src/x.ts",
      title: "Unused export",
    });
    const b = computeFindingFingerprint({
      source: "unused_export",
      path: "src/x.ts",
      title: "  Unused Export  ",
    });
    expect(a).toBe(b);
  });

  it("differs across sources or paths", () => {
    const a = computeFindingFingerprint({
      source: "unused_export",
      path: "src/x.ts",
      title: "Unused export",
    });
    const b = computeFindingFingerprint({
      source: "unused_export",
      path: "src/y.ts",
      title: "Unused export",
    });
    expect(a).not.toBe(b);
  });
});

describe("listUnusedExportFindings", () => {
  it("flags an exported symbol with no inbound reference", () => {
    const findings = listUnusedExportFindings(withUnusedExport);
    expect(findings.some((f) => f.path === "src/users/lruCache.ts")).toBe(true);
    expect(findings.some((f) => f.path === "src/users/fetchUser.ts")).toBe(
      false,
    );
    for (const finding of findings) {
      expect(finding.source).toBe("unused_export");
      expect(finding.fingerprint.length).toBeGreaterThan(0);
    }
  });

  it("never flags a test file or a barrel", () => {
    const withNoise = snapshot([
      ...withUnusedExport.files,
      file("src/users/lruCache.test.ts", {
        symbols: [
          {
            name: "unusedInTest",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
      }),
      file("src/index.ts", {
        symbols: [
          {
            name: "reExported",
            kind: "function",
            start: 0,
            end: 10,
            exported: true,
          },
        ],
      }),
    ]);
    const findings = listUnusedExportFindings(withNoise);
    expect(findings.some((f) => f.path?.endsWith(".test.ts"))).toBe(false);
    expect(findings.some((f) => f.path === "src/index.ts")).toBe(false);
  });
});

describe("listDuplicateImplementationFindings (M-074 B1)", () => {
  it("flags the later file when two files export the exact same name", () => {
    const snap = snapshot([
      file("src/lib/formatDate.ts", {
        symbols: [
          {
            name: "formatDate",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "formatDate", kind: "name" }],
      }),
      file("src/utils/formatDate.ts", {
        symbols: [
          {
            name: "formatDate",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "formatDate", kind: "name" }],
      }),
    ]);
    const findings = listDuplicateImplementationFindings(snap);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.path).toBe("src/utils/formatDate.ts");
    expect(findings[0]!.source).toBe("duplicate_implementation");
  });

  it("does not flag two functions that merely share a word", () => {
    const snap = snapshot([
      file("src/client/fetchDna.ts", {
        symbols: [
          {
            name: "fetchDna",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "fetchDna", kind: "name" }],
      }),
      file("src/client/fetchHealth.ts", {
        symbols: [
          {
            name: "fetchHealth",
            kind: "function",
            start: 0,
            end: 20,
            exported: true,
          },
        ],
        exports: [{ name: "fetchHealth", kind: "name" }],
      }),
    ]);
    expect(listDuplicateImplementationFindings(snap)).toHaveLength(0);
  });

  it("never flags a test file or a barrel", () => {
    const snap = snapshot([
      file("src/lib/formatDate.ts", {
        symbols: [
          {
            name: "formatDate",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "formatDate", kind: "name" }],
      }),
      file("src/lib/formatDate.test.ts", {
        symbols: [
          {
            name: "formatDate",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "formatDate", kind: "name" }],
      }),
      file("src/index.ts", {
        symbols: [
          {
            name: "formatDate",
            kind: "function",
            start: 0,
            end: 30,
            exported: true,
          },
        ],
        exports: [{ name: "formatDate", kind: "name" }],
      }),
    ]);
    expect(listDuplicateImplementationFindings(snap)).toHaveLength(0);
  });
});

describe("listWrapperOverExistingFindings (M-074 B1)", () => {
  it("flags a function whose whole body is a single call to another export", () => {
    const snap = snapshot([
      file("src/lib/fetchUser.ts", {
        symbols: [
          {
            name: "fetchUser",
            kind: "function",
            start: 0,
            end: 60,
            exported: true,
          },
        ],
        exports: [{ name: "fetchUser", kind: "name" }],
      }),
      file("src/api/getUser.ts", {
        symbols: [
          {
            name: "getUser",
            kind: "function",
            start: 0,
            end: 40,
            exported: true,
          },
        ],
        exports: [{ name: "getUser", kind: "name" }],
        imports: [{ source: "../lib/fetchUser.ts", specifiers: ["fetchUser"] }],
        references: [{ name: "fetchUser", kind: "call", start: 20, end: 29 }],
      }),
    ]);
    const findings = listWrapperOverExistingFindings(snap);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.path).toBe("src/api/getUser.ts");
    expect(findings[0]!.source).toBe("wrapper_over_existing");
  });

  it("does not flag a function with two distinct calls in its body", () => {
    const snap = snapshot([
      file("src/lib/a.ts", {
        symbols: [
          { name: "a", kind: "function", start: 0, end: 20, exported: true },
        ],
        exports: [{ name: "a", kind: "name" }],
      }),
      file("src/lib/b.ts", {
        symbols: [
          { name: "b", kind: "function", start: 0, end: 20, exported: true },
        ],
        exports: [{ name: "b", kind: "name" }],
      }),
      file("src/api/combine.ts", {
        symbols: [
          {
            name: "combine",
            kind: "function",
            start: 0,
            end: 50,
            exported: true,
          },
        ],
        exports: [{ name: "combine", kind: "name" }],
        imports: [
          { source: "../lib/a.ts", specifiers: ["a"] },
          { source: "../lib/b.ts", specifiers: ["b"] },
        ],
        references: [
          { name: "a", kind: "call", start: 10, end: 12 },
          { name: "b", kind: "call", start: 20, end: 22 },
        ],
      }),
    ]);
    expect(listWrapperOverExistingFindings(snap)).toHaveLength(0);
  });
});

describe("findingStillOpen (M-071 L3 re-scan)", () => {
  it("is present before the fix and absent after the export is deleted", () => {
    const [finding] = listUnusedExportFindings(withUnusedExport);
    expect(finding).toBeDefined();
    expect(findingStillOpen(withUnusedExport, finding!.fingerprint)).toBe(true);
    expect(
      findingStillOpen(afterDeletingUnusedExport, finding!.fingerprint),
    ).toBe(false);
  });
});
