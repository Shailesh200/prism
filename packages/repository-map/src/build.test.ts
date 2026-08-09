import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RepositoryMapSchema,
  unsafeRepoId,
  type FeatureInfo,
  type GraphSnapshotDto,
  type IndexSnapshot,
} from "@repo-prism/shared";
import { buildRepositoryMap } from "./build.js";
import { zoomIn, zoomOut } from "./zoom.js";

const here = dirname(fileURLToPath(import.meta.url));

function snapshot(files: IndexSnapshot["files"]): IndexSnapshot {
  return {
    repoId: unsafeRepoId("repo:map"),
    rootPath: "/tmp/map-fixture",
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

const depGraph: GraphSnapshotDto = {
  id: "deps",
  nodes: [
    { id: "file:apps/web/a.ts", kind: "file", label: "a.ts" },
    { id: "file:apps/api/b.ts", kind: "file", label: "b.ts" },
  ],
  edges: [
    {
      id: "e1",
      kind: "imports",
      from: "file:apps/web/a.ts",
      to: "file:apps/api/b.ts",
    },
  ],
};

const features: FeatureInfo[] = [
  {
    id: "feat:web",
    name: "Web",
    slug: "web",
    confidence: 0.9,
    memberFiles: ["apps/web/a.ts"],
    evidence: [],
  },
  {
    id: "feat:api",
    name: "API",
    slug: "api",
    confidence: 0.8,
    memberFiles: ["apps/api/b.ts"],
    evidence: [],
  },
];

describe("buildRepositoryMap (M-017)", () => {
  it("matches golden JSON at feature zoom", () => {
    const map = buildRepositoryMap({
      snapshot: snapshot([
        {
          path: "apps/web/a.ts",
          pluginId: "typescript",
          contentHash: "1",
          status: "analyzed",
          symbols: [{ name: "A", kind: "function", start: 0, end: 1 }],
          imports: [],
          exports: [],
          references: [],
          diagnostics: [],
        },
        {
          path: "apps/api/b.ts",
          pluginId: "typescript",
          contentHash: "2",
          status: "analyzed",
          symbols: [{ name: "B", kind: "function", start: 0, end: 1 }],
          imports: [],
          exports: [],
          references: [],
          diagnostics: [],
        },
      ]),
      dependencyGraph: depGraph,
      features,
      landmarks: [
        {
          id: "landmark:entry:apps/web/a.ts",
          label: "a.ts",
          path: "apps/web/a.ts",
          kind: "entrypoint",
        },
      ],
      packages: [
        { name: "@demo/web", rootDir: "apps/web" },
        { name: "@demo/api", rootDir: "apps/api" },
      ],
      zoom: "feature",
      generatedAt: "2026-07-20T12:00:00.000Z",
    });

    expect(RepositoryMapSchema.safeParse(map).success).toBe(true);
    const goldenPath = join(here, "fixtures", "map-feature.golden.json");
    // Regenerate with UPDATE_GOLDEN=1 after an intentional shape change, then
    // review the diff — the point of the fixture is that changes are visible.
    if (process.env.UPDATE_GOLDEN === "1") {
      const { layout: _drop, ...withoutLayout } = map;
      writeFileSync(
        goldenPath,
        `${JSON.stringify(withoutLayout, null, 2)}\n`,
        "utf8",
      );
    }
    const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as unknown;
    // layout positions may vary by layout impl — compare without layout
    const { layout: _l, ...stable } = map;
    const { layout: _g, ...goldenStable } = golden as RepositoryMapSchemaLike;
    expect(stable).toEqual(goldenStable);
  });

  it("changes graph granularity across zoom in/out", () => {
    const base = {
      snapshot: snapshot([]),
      dependencyGraph: depGraph,
      features,
      landmarks: [],
      packages: [
        { name: "@demo/web", rootDir: "apps/web" },
        { name: "@demo/api", rootDir: "apps/api" },
      ],
      generatedAt: "2026-07-20T12:00:00.000Z",
    };
    const feature = buildRepositoryMap({ ...base, zoom: "feature" });
    const file = buildRepositoryMap({
      ...base,
      zoom: zoomIn(feature.zoom),
    });
    const pkg = buildRepositoryMap({
      ...base,
      zoom: zoomOut(feature.zoom),
    });
    expect(feature.zoom).toBe("feature");
    expect(file.zoom).toBe("file");
    expect(pkg.zoom).toBe("package");
    expect(file.graph.nodes.some((n) => n.id.startsWith("file:"))).toBe(true);
    expect(pkg.graph.nodes.some((n) => n.id.startsWith("pkg:"))).toBe(true);
    expect(feature.graph.nodes.some((n) => n.id.startsWith("feature:"))).toBe(
      true,
    );
  });

  // The prefix-set rewrite in M-035 turned this from O(features² × members²)
  // into a set intersection. It is only a legitimate optimisation if it links
  // exactly the same features, so this pins the answer against the definition
  // it replaced rather than against whatever the new code happens to produce.
  it("links exactly the features that share a two-segment prefix", () => {
    const many: FeatureInfo[] = [
      { ...feature("a", ["apps/web/one.ts", "apps/web/two.ts"]) },
      { ...feature("b", ["apps/web/three.ts"]) },
      { ...feature("c", ["apps/api/four.ts"]) },
      { ...feature("d", ["apps/api/five.ts", "libs/shared/six.ts"]) },
      { ...feature("e", ["libs/shared/seven.ts"]) },
      { ...feature("f", ["standalone.ts"]) },
    ];

    const map = buildRepositoryMap({
      snapshot: snapshot([]),
      dependencyGraph: { id: "deps", nodes: [], edges: [] },
      features: many,
      landmarks: [],
      packages: [],
      zoom: "feature",
      generatedAt: "2026-07-20T12:00:00.000Z",
    });

    const related = map.graph.edges
      .filter((e) => e.kind === "related")
      .map((e) => e.id)
      .sort();

    expect(related).toEqual(referenceRelatedEdges(many));
    // a↔b share apps/web, c↔d share apps/api, d↔e share libs/shared. f shares
    // nothing, and a single-segment path must not match a two-segment one.
    expect(related).toEqual([
      "map:feat:feat:a:feat:b",
      "map:feat:feat:c:feat:d",
      "map:feat:feat:d:feat:e",
    ]);
  });

  it("reports symbol zoom truncation when a file has more than 8 symbols (M-056)", () => {
    const symbols = Array.from({ length: 12 }, (_, i) => ({
      name: `sym${String(i).padStart(2, "0")}`,
      kind: "function" as const,
      start: i,
      end: i + 1,
    }));
    const map = buildRepositoryMap({
      snapshot: snapshot([
        {
          path: "src/big.ts",
          pluginId: "typescript",
          contentHash: "1",
          status: "analyzed",
          symbols,
          imports: [],
          exports: [],
          references: [],
          diagnostics: [],
        },
      ]),
      dependencyGraph: { id: "deps", nodes: [], edges: [] },
      features: [],
      landmarks: [],
      packages: [],
      zoom: "symbol",
      generatedAt: "2026-07-20T12:00:00.000Z",
    });
    expect(map.truncated).toBe(true);
    expect(map.totalCount).toBe(12);
    expect(map.graph.nodes.filter((n) => n.kind === "symbol")).toHaveLength(8);
    expect(RepositoryMapSchema.safeParse(map).success).toBe(true);
  });
});

function feature(id: string, memberFiles: string[]): FeatureInfo {
  return {
    id: `feat:${id}`,
    name: id.toUpperCase(),
    slug: id,
    confidence: 0.5,
    memberFiles,
    evidence: [],
  };
}

/** The pre-optimisation definition, kept verbatim as the thing to agree with. */
function referenceRelatedEdges(features: readonly FeatureInfo[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i]!;
      const b = features[j]!;
      const shared = a.memberFiles.some((fa) =>
        b.memberFiles.some(
          (fb) =>
            fa.split("/").slice(0, 2).join("/") ===
            fb.split("/").slice(0, 2).join("/"),
        ),
      );
      if (shared) ids.push(`map:feat:${a.id}:${b.id}`);
    }
  }
  return ids.sort();
}

type RepositoryMapSchemaLike = {
  layout?: unknown;
  [key: string]: unknown;
};
