import type {
  BackendReport,
  BlastRadiusReport,
  DnaReport,
  GitActivity,
  GitRecentFile,
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

export type AppView =
  | "overview"
  | "map"
  | "dna"
  | "profile"
  | "domains"
  | "domain"
  | "blast"
  | "trends"
  | "integrations"
  | "settings";

export type DashboardPayload = {
  root: string;
  repoLabel: string;
  map: RepositoryMap;
  gitActivity: GitActivity | null;
  health: HealthScore | null;
  dna: DnaReport | null;
  branch?: string;
};

export type MapPayload = {
  map: RepositoryMap;
  recentChanges: GitRecentFile[];
  branch?: string;
};

export type ImpactBundle = {
  blast: BlastRadiusReport;
  safeDelete: SafeDeleteReport;
  rename: RenameImpactReport;
  testImpact: TestImpactReport;
};

export type ImpactTarget = {
  kind: "file" | "symbol";
  id: string;
  path?: string;
  newName?: string;
};

export type SymbolSearchHit = {
  id: string;
  name: string;
  kind: string;
  path: string;
  exported: boolean;
};

export type HostRequest =
  | { id: string; method: "dashboard" }
  | {
      id: string;
      method: "map";
      zoom: MapZoomLevel;
      layers?: MapLayerId[];
    }
  | { id: string; method: "reindex" }
  | { id: string; method: "overlay"; kind: string }
  | { id: string; method: "backend" }
  | { id: string; method: "graph" }
  | { id: string; method: "impact"; target: ImpactTarget }
  | { id: string; method: "symbols"; query: string };

export type HostResponse =
  | { id: string; ok: true; method: "dashboard"; data: DashboardPayload }
  | { id: string; ok: true; method: "map"; data: MapPayload }
  | { id: string; ok: true; method: "reindex"; data: null }
  | {
      id: string;
      ok: true;
      method: "overlay";
      data: UtilityOverlayReport | null;
    }
  | { id: string; ok: true; method: "backend"; data: BackendReport | null }
  | { id: string; ok: true; method: "graph"; data: GraphSnapshotDto | null }
  | {
      id: string;
      ok: true;
      method: "impact";
      data: { ok: true; value: ImpactBundle } | { ok: false; error: string };
    }
  | { id: string; ok: true; method: "symbols"; data: SymbolSearchHit[] }
  | { id: string; ok: false; error: string };

export type HostToWebview =
  | HostResponse
  | { type: "status"; message: string; kind: "info" | "error" | "loading" }
  | { type: "navigate"; view: AppView; domainId?: string };

export type WebviewToHost =
  | { type: "ready"; view?: AppView }
  | { type: "request"; request: HostRequest }
  | { type: "openFile"; path: string }
  | { type: "openInBrowser" }
  | { type: "zoom"; zoom: MapZoomLevel }
  | { type: "layers"; layers: MapLayerId[] };
