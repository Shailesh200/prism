import { describe, expect, it } from "vitest";
import type { IndexSnapshot } from "@prism/shared";
import { nodesFromIndexSnapshot } from "./from-index.js";

describe("nodesFromIndexSnapshot", () => {
  it("emits sorted file nodes for analyzed files only", () => {
    const snapshot: IndexSnapshot = {
      repoId: "repo:t",
      rootPath: "/tmp/t",
      indexedAt: "2026-07-20T00:00:00.000Z",
      files: [
        {
          path: "src/b.ts",
          pluginId: "typescript",
          contentHash: "b",
          status: "analyzed",
          symbols: [],
          imports: [{ source: "./a.js", specifiers: ["a"] }],
          exports: [],
          references: [],
          diagnostics: [],
        },
        {
          path: "src/a.ts",
          pluginId: "typescript",
          contentHash: "a",
          status: "analyzed",
          symbols: [{ name: "a", kind: "function", start: 0, end: 1 }],
          imports: [],
          exports: [],
          references: [],
          diagnostics: [],
        },
        {
          path: "notes.md",
          pluginId: null,
          contentHash: "n",
          status: "skipped_unsupported",
          symbols: [],
          imports: [],
          exports: [],
          references: [],
          diagnostics: [],
        },
      ],
      stats: {
        filesTotal: 3,
        filesIndexed: 2,
        filesSkipped: 1,
        durationMs: 1,
      },
      warnings: [],
    };

    const nodes = nodesFromIndexSnapshot(snapshot);
    expect(nodes.map((n) => n.id)).toEqual(["file:src/a.ts", "file:src/b.ts"]);
    expect(nodes[0]?.kind).toBe("file");
    expect(nodes[0]?.attrs?.symbolCount).toBe(1);
  });
});
