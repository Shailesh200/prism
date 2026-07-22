import type {
  GitRecentFile,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
} from "@prism/shared";

export type HostToWebview =
  | {
      type: "map";
      map: RepositoryMap;
      recentChanges: GitRecentFile[];
      branch?: string;
    }
  | { type: "status"; message: string; kind: "info" | "error" | "loading" };

export type WebviewToHost =
  | { type: "ready" }
  | { type: "zoom"; zoom: MapZoomLevel }
  | { type: "layers"; layers: MapLayerId[] };
