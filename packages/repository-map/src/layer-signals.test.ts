import { describe, expect, it } from "vitest";
import type {
  GitFileSignal,
  GraphSnapshotDto,
  IndexSnapshot,
  IndexedFile,
} from "@prism/shared";
import {
  annotateGraphWithLayerSignals,
  computeLayerSignals,
  heatForActiveLayers,
  isHeatUnavailable,
  type LayerSignalScores,
} from "./layer-signals.js";

function file(path: string, overrides: Partial<IndexedFile> = {}): IndexedFile {
  return {
    path,
    pluginId: "ts",
    contentHash: `hash:${path}`,
    status: "analyzed",
    symbols: [],
    imports: [],
    exports: [],
    references: [],
    diagnostics: [],
    ...overrides,
  } as IndexedFile;
}

function snap(files: IndexSnapshot["files"]): IndexSnapshot {
  return {
    repoId: "repo:test",
    rootPath: "/tmp/test",
    indexedAt: "2026-07-20T00:00:00.000Z",
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed: files.length,
      filesSkipped: 0,
      durationMs: 1,
    },
    warnings: [],
  };
}

function fileNode(path: string) {
  return {
    id: `file:${path}`,
    kind: "file" as const,
    label: path,
    attrs: { path },
  };
}

const snapshot = snap([
  file("src/a.ts", {
    imports: [{ source: "./b", specifiers: ["b"] }],
    diagnostics: [
      { severity: "error", message: "x" },
      { severity: "warning", message: "y" },
    ],
  }),
  file("src/b.ts"),
  file("src/a.test.ts"),
]);

const dep: GraphSnapshotDto = {
  id: "dep",
  nodes: [
    fileNode("src/a.ts"),
    fileNode("src/b.ts"),
    fileNode("src/a.test.ts"),
  ],
  edges: [
    { id: "e1", kind: "imports", from: "file:src/a.ts", to: "file:src/b.ts" },
  ],
};

function value(signals: LayerSignalScores, key: keyof LayerSignalScores) {
  return signals[key].value;
}

describe("computeLayerSignals — measured signals", () => {
  const signals = computeLayerSignals(snapshot, dep);
  const a = signals.get("file:src/a.ts")!;
  const b = signals.get("file:src/b.ts")!;

  it("scores debt from diagnostics and marks it measured", () => {
    expect(value(a, "debt")).toBeGreaterThan(value(b, "debt")!);
    expect(a.debt.provenance).toBe("measured");
  });

  it("scores risk from fan-in and marks it heuristic", () => {
    expect(value(b, "risk")).toBeGreaterThan(value(a, "risk")!);
    expect(b.risk.provenance).toBe("heuristic");
  });

  it("scores coverage gap from a neighbouring test file", () => {
    // a.ts has a.test.ts beside it; b.ts has nothing.
    expect(value(b, "coverage")).toBeGreaterThan(value(a, "coverage")!);
    expect(a.coverage.provenance).toBe("heuristic");
  });
});

// ADR-0029: three layers were derived from an FNV hash of the file path.
// Because hashing is deterministic they looked stable across runs, which reads
// as measurement rather than noise.
describe("computeLayerSignals — no fabricated values", () => {
  const signals = computeLayerSignals(snapshot, dep);
  const a = signals.get("file:src/a.ts")!;

  it("reports performance as unavailable with no number", () => {
    expect(a.performance.provenance).toBe("unavailable");
    expect(a.performance.value).toBeNull();
  });

  it("reports activity as unavailable without git", () => {
    expect(a.activity.provenance).toBe("unavailable");
    expect(a.activity.value).toBeNull();
  });

  it("reports ownership as unavailable without git", () => {
    expect(a.ownership.provenance).toBe("unavailable");
    expect(a.ownership.value).toBeNull();
  });

  it("never pairs a number with unavailable provenance", () => {
    for (const score of signals.values()) {
      for (const signal of Object.values(score)) {
        if (signal.provenance === "unavailable") {
          expect(signal.value).toBeNull();
        } else {
          expect(typeof signal.value).toBe("number");
        }
      }
    }
  });

  it("does not vary with the file path when data is absent", () => {
    const other = computeLayerSignals(
      snap([file("totally/different/name.ts")]),
      { id: "dep", nodes: [fileNode("totally/different/name.ts")], edges: [] },
    ).get("file:totally/different/name.ts")!;

    expect(other.performance).toEqual(a.performance);
    expect(other.activity).toEqual(a.activity);
    expect(other.ownership).toEqual(a.ownership);
  });
});

describe("computeLayerSignals — git-backed signals", () => {
  const git = new Map<string, GitFileSignal>([
    [
      "src/a.ts",
      {
        path: "src/a.ts",
        recency: 0.8,
        commits: 10,
        contributors: [
          { author: "Ada", commits: 9 },
          { author: "Bob", commits: 1 },
        ],
      } as GitFileSignal,
    ],
  ]);

  const signals = computeLayerSignals(snapshot, dep, git);
  const a = signals.get("file:src/a.ts")!;
  const b = signals.get("file:src/b.ts")!;

  it("measures activity from commit recency", () => {
    expect(a.activity.provenance).toBe("measured");
    expect(a.activity.value).toBeCloseTo(0.8);
  });

  it("measures ownership as the leading contributor's share", () => {
    expect(a.ownership.provenance).toBe("measured");
    expect(a.ownership.value).toBeCloseTo(0.9);
  });

  it("leaves files with no git history unavailable", () => {
    expect(b.activity.provenance).toBe("unavailable");
    expect(b.ownership.provenance).toBe("unavailable");
  });

  it("still reports performance as unavailable", () => {
    expect(a.performance.provenance).toBe("unavailable");
  });
});

describe("annotateGraphWithLayerSignals", () => {
  const signals = computeLayerSignals(snapshot, dep);
  const annotated = annotateGraphWithLayerSignals(dep, signals);
  const attrs = annotated.nodes.find((n) => n.id === "file:src/a.ts")?.attrs;

  it("emits provenance for every layer", () => {
    const provenance = attrs?.layerProvenance as Record<string, string>;
    expect(provenance.performance).toBe("unavailable");
    expect(provenance.debt).toBe("measured");
    expect(provenance.risk).toBe("heuristic");
  });

  it("omits values for unavailable layers rather than writing zero", () => {
    const values = attrs?.layerSignals as Record<string, number>;
    expect(values).not.toHaveProperty("performance");
    expect(values).not.toHaveProperty("activity");
    expect(values.debt).toBeGreaterThan(0);
  });

  it("preserves existing node attrs", () => {
    expect(attrs?.path).toBe("src/a.ts");
  });

  it("rolls member files up onto a container node", () => {
    const withPackage: GraphSnapshotDto = {
      ...dep,
      nodes: [
        ...dep.nodes,
        {
          id: "pkg:src",
          kind: "package",
          label: "src",
          attrs: { memberFiles: ["src/a.ts", "src/b.ts"] },
        },
      ],
    };
    const rolled = annotateGraphWithLayerSignals(withPackage, signals);
    const pkg = rolled.nodes.find((n) => n.id === "pkg:src")?.attrs;
    const provenance = pkg?.layerProvenance as Record<string, string>;
    // Rolling up files that all lack activity must stay unavailable, not zero.
    expect(provenance.activity).toBe("unavailable");
    expect(provenance.debt).toBe("measured");
  });
});

// M-035 replaced two per-node scans with precomputed lookups. The risk in that
// kind of change is that the fast answer quietly differs from the slow one, so
// these pin both against the definitions they replaced, on paths chosen to be
// awkward: shared prefixes, dots inside directory names, nested test files.
describe("precomputed lookups agree with the scans they replaced", () => {
  const paths = [
    "src/cart.ts",
    "src/cart.test.ts",
    "src/cartesian.ts",
    "src/cart/index.ts",
    "src/cart/index.test.ts",
    "src/checkout.ts",
    "src/check.out/thing.ts",
    "src/deep/a/b/c.ts",
    "src/deep/a/b/c.spec.ts",
    "lib/only.ts",
    "no-extension",
  ];
  const wide = snap(paths.map((p) => file(p)));
  const wideGraph: GraphSnapshotDto = {
    id: "dep",
    nodes: paths.map((p) => fileNode(p)),
    edges: [],
  };
  const signals = computeLayerSignals(wide, wideGraph);

  it("marks exactly the files the original coverage scan would mark", () => {
    const testPaths = paths.filter(
      (p) => p.includes(".test.") || p.includes(".spec."),
    );

    for (const path of paths) {
      const base = path.replace(/\.[^.]+$/, "");
      const expected =
        path.includes(".test.") ||
        path.includes(".spec.") ||
        testPaths.some(
          (t) => t.startsWith(`${base}.`) || t.startsWith(`${base}/`),
        );

      // coverage is the *gap*: 0 when covered, 1 when not.
      expect(signals.get(`file:${path}`)!.coverage.value).toBe(
        expected ? 0 : 1,
      );
    }
  });

  it("rolls up the same files the original directory scan would", () => {
    const dirs = ["src", "src/cart", "src/deep/a", "lib", "src/cart/"];
    const byPath = new Map(
      [...signals.entries()].map(([id, s]) => [id.slice("file:".length), s]),
    );

    for (const dir of dirs) {
      const prefix = dir.replace(/\/$/, "");
      const expected = [...byPath.entries()]
        .filter(([p]) => p === prefix || p.startsWith(`${prefix}/`))
        .map(([, s]) => s);

      const annotated = annotateGraphWithLayerSignals(
        {
          ...wideGraph,
          nodes: [
            ...wideGraph.nodes,
            {
              id: `dir:${dir}`,
              kind: "package",
              label: dir,
              attrs: { rootDir: dir },
            },
          ],
        },
        signals,
      );

      const rolled = annotated.nodes.find((n) => n.id === `dir:${dir}`)?.attrs;
      const values = rolled?.layerSignals as Record<string, number>;

      const meanCoverage =
        expected.length === 0
          ? undefined
          : expected.reduce((sum, s) => sum + (s.coverage.value ?? 0), 0) /
            expected.length;

      expect(values.coverage).toBe(meanCoverage);
    }
  });
});

describe("heatForActiveLayers", () => {
  const signals = computeLayerSignals(snapshot, dep);
  const a = signals.get("file:src/a.ts")!;

  it("averages the layers that have data", () => {
    const heat = heatForActiveLayers(a, ["debt", "risk"]);
    expect(heat).not.toBeNull();
    expect(heat!).toBeGreaterThan(0);
  });

  it("returns null when no active layer has data", () => {
    expect(heatForActiveLayers(a, ["performance"])).toBeNull();
    expect(isHeatUnavailable(a, ["performance", "activity"])).toBe(true);
  });

  it("returns null for structural layers alone", () => {
    expect(heatForActiveLayers(a, ["architecture", "dependency"])).toBeNull();
  });

  it("ignores unavailable layers when mixed with available ones", () => {
    const mixed = heatForActiveLayers(a, ["performance", "debt"]);
    const only = heatForActiveLayers(a, ["debt"]);
    expect(mixed).toBe(only);
  });
});
