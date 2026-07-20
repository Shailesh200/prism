import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RepositoryMapSchema,
  unsafeRepoId,
  type FeatureInfo,
  type GraphSnapshotDto,
  type IndexSnapshot,
} from "@prism/shared";
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
});

type RepositoryMapSchemaLike = {
  layout?: unknown;
  [key: string]: unknown;
};
