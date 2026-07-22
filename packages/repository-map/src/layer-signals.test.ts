import { describe, expect, it } from "vitest";
import type { GraphSnapshotDto, IndexSnapshot } from "@prism/shared";
import {
  annotateGraphWithLayerSignals,
  computeLayerSignals,
} from "./layer-signals.js";

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

describe("layer-signals", () => {
  it("scores debt from diagnostics and risk from fan-in", () => {
    const snapshot = snap([
      {
        path: "src/a.ts",
        pluginId: "ts",
        contentHash: "h1",
        status: "analyzed",
        symbols: [],
        imports: [{ source: "./b", specifiers: ["b"] }],
        exports: [],
        references: [],
        diagnostics: [
          { severity: "error", message: "x" },
          { severity: "warning", message: "y" },
        ],
      },
      {
        path: "src/b.ts",
        pluginId: "ts",
        contentHash: "h2",
        status: "analyzed",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
      {
        path: "src/a.test.ts",
        pluginId: "ts",
        contentHash: "h3",
        status: "analyzed",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
    ]);

    const dep: GraphSnapshotDto = {
      id: "dep",
      nodes: [
        {
          id: "file:src/a.ts",
          kind: "file",
          label: "src/a.ts",
          attrs: { path: "src/a.ts" },
        },
        {
          id: "file:src/b.ts",
          kind: "file",
          label: "src/b.ts",
          attrs: { path: "src/b.ts" },
        },
        {
          id: "file:src/a.test.ts",
          kind: "file",
          label: "src/a.test.ts",
          attrs: { path: "src/a.test.ts" },
        },
      ],
      edges: [
        {
          id: "e1",
          kind: "imports",
          from: "file:src/a.ts",
          to: "file:src/b.ts",
        },
      ],
    };

    const signals = computeLayerSignals(snapshot, dep);
    const a = signals.get("file:src/a.ts");
    const b = signals.get("file:src/b.ts");
    expect(a?.debt ?? 0).toBeGreaterThan(b?.debt ?? 0);
    expect(b?.risk ?? 0).toBeGreaterThan(a?.risk ?? 0);
    // a.ts has a.test.ts nearby → low gap; b.ts has none → higher gap
    expect(b?.coverage ?? 0).toBeGreaterThan(a?.coverage ?? 0);

    const annotated = annotateGraphWithLayerSignals(dep, signals);
    const attrs = annotated.nodes.find((n) => n.id === "file:src/a.ts")?.attrs;
    expect(attrs?.layerSignals).toBeTruthy();
  });
});
