import react from "@vitejs/plugin-react";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import type {
  GitActivity,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
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
};

const workspaceCache = new Map<string, Promise<Workspace>>();

type Preset = {
  id: string;
  label: string;
  root: string;
};

function presets(): Preset[] {
  return [
    { id: "fixture", label: "Demo fixture", root: fixtureRoot },
    { id: "prism", label: "Prism (this repo)", root: repoRoot },
  ];
}

function defaultRoot(): string {
  const fromEnv = process.env.PRISM_PLAYGROUND_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return fixtureRoot;
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
