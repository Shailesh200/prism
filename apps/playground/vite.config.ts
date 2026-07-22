import react from "@vitejs/plugin-react";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import type {
  BackendReport,
  BlastRadiusReport,
  DnaReport,
  GitActivity,
  GraphSnapshotDto,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RenameImpactReport,
  RepositoryMap,
  SafeDeleteReport,
  TestImpactReport,
  UtilityOverlayReport,
} from "@prism/shared";
import { MapLayerIdSchema, MapZoomLevelSchema } from "@prism/shared";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const fixtureRoot = resolve(
  appRoot,
  "../../packages/intelligence/fixtures/m012-features",
);
const uiSrc = resolve(appRoot, "../../packages/ui/src");

const ZOOM_LEVELS = MapZoomLevelSchema.options;

type Workspace = {
  getRepositoryMap: (options?: {
    zoom?: MapZoomLevel;
    layers?: readonly string[];
  }) =>
    | { ok: true; value: RepositoryMap }
    | { ok: false; error: { message: string } };
  getGitActivity: () =>
    | { ok: true; value: GitActivity }
    | { ok: false; error: { message: string } };
  getHealth: () => Promise<
    { ok: true; value: HealthScore } | { ok: false; error: { message: string } }
  >;
  getDna: () => Promise<
    { ok: true; value: DnaReport } | { ok: false; error: { message: string } }
  >;
  getUtilityOverlay: (
    kind: string,
    options?: { packageId?: string },
  ) => Promise<
    | { ok: true; value: UtilityOverlayReport }
    | { ok: false; error: { message: string } }
  >;
  getBackendReport: (options?: {
    packageId?: string;
  }) => Promise<
    | { ok: true; value: BackendReport }
    | { ok: false; error: { message: string } }
  >;
  getDependencyGraph: () =>
    | { ok: true; value: GraphSnapshotDto }
    | { ok: false; error: { message: string } };
  blastRadius: (input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }) => Promise<
    | { ok: true; value: BlastRadiusReport }
    | { ok: false; error: { message: string } }
  >;
  safeDelete: (input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }) => Promise<
    | { ok: true; value: SafeDeleteReport }
    | { ok: false; error: { message: string } }
  >;
  renameImpact: (input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
    newName?: string;
  }) => Promise<
    | { ok: true; value: RenameImpactReport }
    | { ok: false; error: { message: string } }
  >;
  testImpact: (input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }) => Promise<
    | { ok: true; value: TestImpactReport }
    | { ok: false; error: { message: string } }
  >;
  findSymbol: (query: { name: string; path?: string; kind?: string }) =>
    | {
        ok: true;
        value: Array<{
          id: string;
          name: string;
          kind: string;
          path: string;
          exported: boolean;
        }>;
      }
    | { ok: false; error: { message: string } };
  getKnowledgeGraph: () =>
    | {
        ok: true;
        value: {
          symbols: Array<{
            id: string;
            name: string;
            kind: string;
            path: string;
            exported: boolean;
          }>;
        };
      }
    | { ok: false; error: { message: string } };
};

const workspaceCache = new Map<string, Promise<Workspace>>();

type Preset = {
  id: string;
  label: string;
  root: string;
};

function presets(): Preset[] {
  return [];
}

/**
 * Auto-detect the workspace to index. Prefer an explicit env override, else the
 * repository the playground is running inside (this repo).
 */
function defaultRoot(): string {
  const fromEnv = process.env.PRISM_PLAYGROUND_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return repoRoot;
}

async function assertReadableDir(root: string): Promise<void> {
  try {
    await access(root);
  } catch {
    throw new Error(`Repository path not found or not readable: ${root}`);
  }
}

async function getIndexedWorkspace(root: string): Promise<Workspace> {
  const key = resolve(root);
  let pending = workspaceCache.get(key);
  if (!pending) {
    pending = (async () => {
      await assertReadableDir(key);
      const { Prism } = await import("@prism/core");
      const client = Prism.create();
      const opened = client.openRepository(key);
      if (!opened.ok) {
        throw new Error(`openRepository failed: ${opened.error.message}`);
      }
      const indexed = await opened.value.index();
      if (!indexed.ok) {
        throw new Error(`index failed: ${indexed.error.message}`);
      }
      return opened.value;
    })();
    workspaceCache.set(key, pending);
    pending.catch(() => {
      workspaceCache.delete(key);
    });
  }
  return pending;
}

function parseLayers(raw: string | null): MapLayerId[] | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  const out: MapLayerId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    const parsed = MapLayerIdSchema.safeParse(id);
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data);
  }
  return out.length > 0 ? out : undefined;
}

async function loadMap(
  zoom: MapZoomLevel,
  root: string,
  layers?: readonly MapLayerId[],
): Promise<RepositoryMap> {
  const ws = await getIndexedWorkspace(root);
  const result = ws.getRepositoryMap({
    zoom,
    ...(layers === undefined ? {} : { layers }),
  });
  if (!result.ok) {
    throw new Error(`getRepositoryMap failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadGitActivity(root: string): Promise<GitActivity> {
  const ws = await getIndexedWorkspace(root);
  const result = ws.getGitActivity();
  if (!result.ok) {
    throw new Error(`getGitActivity failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadHealth(root: string): Promise<HealthScore> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getHealth();
  if (!result.ok) {
    throw new Error(`getHealth failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadDna(root: string): Promise<DnaReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getDna();
  if (!result.ok) {
    throw new Error(`getDna failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadOverlay(
  root: string,
  kind: string,
): Promise<UtilityOverlayReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getUtilityOverlay(kind);
  if (!result.ok) {
    throw new Error(`getUtilityOverlay failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadBackendReport(root: string): Promise<BackendReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getBackendReport();
  if (!result.ok) {
    throw new Error(`getBackendReport failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadGraph(root: string): Promise<GraphSnapshotDto> {
  const ws = await getIndexedWorkspace(root);
  const result = ws.getDependencyGraph();
  if (!result.ok) {
    throw new Error(`getDependencyGraph failed: ${result.error.message}`);
  }
  return result.value;
}

type ImpactOrigin = {
  kind: "file" | "symbol";
  id: string;
  path?: string;
  newName?: string;
};

async function loadImpactBundle(
  root: string,
  origin: ImpactOrigin,
): Promise<{
  blast: BlastRadiusReport;
  safeDelete: SafeDeleteReport;
  rename: RenameImpactReport;
  testImpact: TestImpactReport;
}> {
  const ws = await getIndexedWorkspace(root);
  const base = {
    kind: origin.kind,
    id: origin.id,
    ...(origin.path === undefined ? {} : { path: origin.path }),
  };
  const [blast, safeDelete, rename, testImpact] = await Promise.all([
    ws.blastRadius(base),
    ws.safeDelete(base),
    ws.renameImpact({
      ...base,
      ...(origin.newName === undefined || origin.newName.trim() === ""
        ? {}
        : { newName: origin.newName.trim() }),
    }),
    ws.testImpact(base),
  ]);
  if (!blast.ok) throw new Error(`blastRadius failed: ${blast.error.message}`);
  if (!safeDelete.ok) {
    throw new Error(`safeDelete failed: ${safeDelete.error.message}`);
  }
  if (!rename.ok) {
    throw new Error(`renameImpact failed: ${rename.error.message}`);
  }
  if (!testImpact.ok) {
    throw new Error(`testImpact failed: ${testImpact.error.message}`);
  }
  return {
    blast: blast.value,
    safeDelete: safeDelete.value,
    rename: rename.value,
    testImpact: testImpact.value,
  };
}

function parseZoom(raw: string | null): MapZoomLevel {
  const parsed = MapZoomLevelSchema.safeParse(raw ?? "feature");
  return parsed.success ? parsed.data : "feature";
}

function resolveRequestedRoot(raw: string | null): string {
  if (raw && raw.trim().length > 0) return resolve(raw.trim());
  return defaultRoot();
}

function sendJson(
  res: {
    statusCode: number;
    setHeader: (k: string, v: string) => void;
    end: (body: string) => void;
  },
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function prismMapApi(): Plugin {
  return {
    name: "prism-map-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) {
          next();
          return;
        }

        void (async () => {
          try {
            const parsed = new URL(url, "http://localhost");

            if (parsed.pathname === "/api/presets") {
              sendJson(res, 200, {
                defaultRoot: defaultRoot(),
                presets: presets(),
              });
              return;
            }

            if (parsed.pathname === "/api/map") {
              const zoom = parseZoom(parsed.searchParams.get("zoom"));
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const layers = parseLayers(parsed.searchParams.get("layers"));
              const map = await loadMap(zoom, root, layers);
              sendJson(res, 200, map);
              return;
            }

            if (parsed.pathname === "/api/git") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const activity = await loadGitActivity(root);
              sendJson(res, 200, activity);
              return;
            }

            if (parsed.pathname === "/api/health") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const health = await loadHealth(root);
              sendJson(res, 200, health);
              return;
            }

            if (parsed.pathname === "/api/dna") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const dna = await loadDna(root);
              sendJson(res, 200, dna);
              return;
            }

            if (parsed.pathname === "/api/overlay") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const kind = parsed.searchParams.get("kind") ?? "api-surface";
              const overlay = await loadOverlay(root, kind);
              sendJson(res, 200, overlay);
              return;
            }

            if (parsed.pathname === "/api/backend") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const report = await loadBackendReport(root);
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/graph") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const graph = await loadGraph(root);
              sendJson(res, 200, graph);
              return;
            }

            if (parsed.pathname === "/api/impact") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const kindRaw = parsed.searchParams.get("kind") ?? "file";
              const kind = kindRaw === "symbol" ? "symbol" : "file";
              const id = parsed.searchParams.get("id")?.trim() ?? "";
              if (id === "") {
                sendJson(res, 400, { error: "id is required" });
                return;
              }
              const path = parsed.searchParams.get("path")?.trim();
              const newName = parsed.searchParams.get("newName")?.trim();
              const bundle = await loadImpactBundle(root, {
                kind,
                id,
                ...(path ? { path } : {}),
                ...(newName ? { newName } : {}),
              });
              sendJson(res, 200, bundle);
              return;
            }

            if (parsed.pathname === "/api/symbols") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const q = (
                parsed.searchParams.get("q")?.trim() ?? ""
              ).toLowerCase();
              if (q.length < 1) {
                sendJson(res, 200, { hits: [] });
                return;
              }
              const ws = await getIndexedWorkspace(root);
              const kg = ws.getKnowledgeGraph();
              if (!kg.ok) {
                throw new Error(
                  `getKnowledgeGraph failed: ${kg.error.message}`,
                );
              }
              const hits = kg.value.symbols
                .filter((s) => s.name.toLowerCase().includes(q))
                .sort((a, b) => {
                  const aExact = a.name.toLowerCase() === q ? 0 : 1;
                  const bExact = b.name.toLowerCase() === q ? 0 : 1;
                  if (aExact !== bExact) return aExact - bExact;
                  return a.name.localeCompare(b.name);
                })
                .slice(0, 30)
                .map((h) => ({
                  id: h.id,
                  name: h.name,
                  kind: h.kind,
                  path: h.path,
                  exported: h.exported,
                }));
              sendJson(res, 200, { hits });
              return;
            }

            next();
          } catch (error) {
            sendJson(res, 500, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      });
    },
    async buildStart() {
      const outDir = join(appRoot, "public");
      await mkdir(outDir, { recursive: true });
      const maps: Partial<Record<MapZoomLevel, RepositoryMap>> = {};
      for (const zoom of ZOOM_LEVELS) {
        maps[zoom] = await loadMap(zoom, fixtureRoot);
      }
      await writeFile(
        join(outDir, "fixture-maps.json"),
        JSON.stringify(maps),
        "utf8",
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), prismMapApi()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@prism/ui/tokens.css": join(uiSrc, "tokens.css"),
      "@prism/ui/map.css": join(uiSrc, "map.css"),
      "@prism/ui": join(uiSrc, "index.ts"),
    },
  },
});
