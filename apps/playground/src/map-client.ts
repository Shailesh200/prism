import type {
  GitActivity,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
} from "@prism/shared";
import {
  GitActivitySchema,
  HealthScoreSchema,
  RepositoryMapSchema,
} from "@prism/shared";

type FixtureMaps = Partial<Record<MapZoomLevel, RepositoryMap>>;

export type PlaygroundPreset = {
  id: string;
  label: string;
  root: string;
};

export type PlaygroundPresets = {
  defaultRoot: string;
  presets: PlaygroundPreset[];
};

async function fromApi(
  zoom: MapZoomLevel,
  root: string | null,
  layers?: readonly MapLayerId[] | null,
): Promise<RepositoryMap | null> {
  try {
    const params = new URLSearchParams({ zoom });
    if (root) params.set("root", root);
    if (layers && layers.length > 0) params.set("layers", layers.join(","));
    const res = await fetch(`/api/map?${params}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      console.warn("map API error", body?.error ?? res.status);
      return null;
    }
    const json: unknown = await res.json();
    const parsed = RepositoryMapSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("RepositoryMap schema mismatch", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.warn("map API fetch failed", error);
    return null;
  }
}

async function fromStatic(zoom: MapZoomLevel): Promise<RepositoryMap | null> {
  try {
    const res = await fetch("/fixture-maps.json");
    if (!res.ok) return null;
    const json = (await res.json()) as FixtureMaps;
    const map = json[zoom] ?? json.feature ?? null;
    if (!map) return null;
    const parsed = RepositoryMapSchema.safeParse(map);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function fetchPresets(): Promise<PlaygroundPresets | null> {
  try {
    const res = await fetch("/api/presets");
    if (!res.ok) return null;
    return (await res.json()) as PlaygroundPresets;
  } catch {
    return null;
  }
}

/** Local git activity for the dashboard (recent files/commits + last synced). */
export async function fetchGitActivity(
  root: string | null,
): Promise<GitActivity | null> {
  try {
    const params = new URLSearchParams();
    if (root) params.set("root", root);
    const res = await fetch(`/api/git?${params}`);
    if (!res.ok) return null;
    const parsed = GitActivitySchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Repository health score + factors (Core `getHealth`). */
export async function fetchHealth(
  root: string | null,
): Promise<HealthScore | null> {
  try {
    const params = new URLSearchParams();
    if (root) params.set("root", root);
    const res = await fetch(`/api/health?${params}`);
    if (!res.ok) return null;
    const parsed = HealthScoreSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Load map from Vite Core middleware (dev) or static fixture bundle (build). */
export async function fetchRepositoryMap(
  zoom: MapZoomLevel,
  root: string | null = null,
  layers?: readonly MapLayerId[] | null,
): Promise<RepositoryMap> {
  const live = await fromApi(zoom, root, layers);
  if (live) return live;
  if (!root) {
    const staticMap = await fromStatic(zoom);
    if (staticMap) return staticMap;
  }
  throw new Error(
    root
      ? `Could not index repository at "${root}". Check the path and playground logs.`
      : `No repository map for zoom "${zoom}". Start with bun --filter @prism/playground dev`,
  );
}
