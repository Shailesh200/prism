import type { MapZoomLevel, RepositoryMap } from "@prism/shared";
import { RepositoryMapSchema } from "@prism/shared";

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
): Promise<RepositoryMap | null> {
  try {
    const params = new URLSearchParams({ zoom });
    if (root) params.set("root", root);
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

/** Load map from Vite Core middleware (dev) or static fixture bundle (build). */
export async function fetchRepositoryMap(
  zoom: MapZoomLevel,
  root: string | null = null,
): Promise<RepositoryMap> {
  const live = await fromApi(zoom, root);
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
