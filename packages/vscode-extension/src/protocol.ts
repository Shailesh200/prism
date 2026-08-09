import type {
  BackendReport,
  BlastRadiusReport,
  BundleAnalyzeCapability,
  BundleWeightReport,
  ChangeReviewReport,
  CodeExplorerReport,
  CodeExplorerTarget,
  ConsentPurposeId,
  ConsentState,
  CwvPreferredSource,
  CwvReport,
  DnaReport,
  DomainReport,
  EngineeringHealthReport,
  ExplainAreaSummary,
  GitActivity,
  GitRecentFile,
  GraphSnapshotDto,
  HealthHistoryBackfillStatus,
  HealthHistoryReport,
  HealthScore,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  RegionMoversReport,
  RenameImpactReport,
  RepositoryMap,
  SafeDeleteReport,
  SecurityReport,
  TestImpactReport,
  TestingReport,
  UtilityOverlayReport,
} from "@repo-prism/shared";
import type { SaveBookmarkInput, WorkspacePackageInfo } from "@repo-prism/core";
import type {
  ApplyRenameInput,
  ApplyRenameResult,
  AuditEntry,
  DispatchWorkflowInput,
  GithubRepoInfo,
  GithubWorkflowRun,
  GithubWorkflowSummary,
  PrismGitignoreStatus,
  RunTestsOptions,
  TestListResult,
} from "@repo-prism/app-shell";

/** Audit entry payload emitted by the host for the webview to record. */
export type HostAuditEntry = Omit<AuditEntry, "id" | "at"> & { at?: string };

export type {
  ApplyRenameInput,
  ApplyRenameResult,
  RunTestsOptions,
  TestListResult,
};

export type AppView =
  | "overview"
  | "map"
  | "dna"
  /** @deprecated M-062 — aliased to dna (Profile merged into DNA). */
  | "profile"
  | "domains"
  | "domain"
  | "testing"
  | "blast"
  | "trends"
  | "integrations"
  | "settings"
  | "review"
  | "explain";

export type DashboardPayload = {
  root: string;
  repoLabel: string;
  map: RepositoryMap;
  gitActivity: GitActivity | null;
  health: HealthScore | null;
  dna: DnaReport | null;
  branch?: string;
  testingScore?: number | null;
  securityScore?: number | null;
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
  intent?: "edit" | "delete";
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
  | { id: string; method: "testing" }
  | { id: string; method: "security" }
  | { id: string; method: "ingestCoverage" }
  | ({ id: string; method: "runTests" } & RunTestsOptions)
  | { id: string; method: "listTests" }
  | { id: string; method: "graph" }
  | { id: string; method: "impact"; target: ImpactTarget }
  | { id: string; method: "symbols"; query: string }
  | { id: string; method: "healthHistory" }
  | { id: string; method: "regionMovers" }
  | { id: string; method: "healthHistoryBackfill" }
  | { id: string; method: "healthHistoryBackfillStatus" }
  | { id: string; method: "engineeringHealth" }
  | { id: string; method: "codeExplorer"; target: CodeExplorerTarget }
  | { id: string; method: "prismGitignore" }
  | { id: string; method: "addPrismGitignore" }
  | { id: string; method: "gitFetch" }
  | {
      id: string;
      method: "lighthouseLab";
      mode?: "lab-fixture" | "run" | "ingest";
      url?: string;
      port?: number;
      routes?: string[];
      formFactor?: "mobile" | "desktop";
    }
  | {
      id: string;
      method: "bundleAnalyze";
      mode?: "run" | "ingest" | "discover";
      packageId?: string;
      packagePath?: string;
      scriptName?: string;
      reportPath?: string;
    }
  | {
      id: string;
      method: "detectBundleAnalyze";
      packageId?: string;
    }
  | { id: string; method: "frontendRoutes" }
  | {
      id: string;
      method: "domainReport";
      domain?: "frontend";
      cwvLocal?: CwvReport | null;
      cwvPagespeed?: CwvReport | null;
      cwvPreferredSource?: CwvPreferredSource;
      loadLatestCwvArtifact?: boolean;
    }
  | { id: string; method: "applyRename"; input: ApplyRenameInput }
  | {
      id: string;
      method: "stageDevopsRemote";
      owner: string;
      repo: string;
      token?: string;
    }
  | {
      id: string;
      method: "fetchGithubWorkflows";
      owner: string;
      repo: string;
      token?: string;
    }
  | {
      id: string;
      method: "fetchGithubWorkflowRuns";
      owner: string;
      repo: string;
      token?: string;
      perPage?: number;
    }
  | {
      id: string;
      method: "fetchGithubRepo";
      owner: string;
      repo: string;
      token?: string;
    }
  | {
      id: string;
      method: "fetchGithubAuthenticatedLogin";
      token: string;
    }
  | {
      id: string;
      method: "testGithubRepoConnection";
      owner: string;
      repo: string;
      token?: string;
    }
  | {
      id: string;
      method: "dispatchGithubWorkflow";
      owner: string;
      repo: string;
      token?: string;
      kind: DispatchWorkflowInput["kind"];
      workflowId?: number | string;
      workflowPath?: string;
      ref?: string;
      inputs?: Record<string, string>;
      eventType?: string;
    }
  | {
      id: string;
      method: "fetchPagespeedMetrics";
      apiKey: string;
      url: string;
    }
  | { id: string; method: "listConsent" }
  | {
      id: string;
      method: "setConsent";
      purpose: ConsentPurposeId;
      granted: boolean;
    }
  | { id: string; method: "reviewChanges"; paths: string[]; base?: string }
  | { id: string; method: "explainArea"; path: string }
  | { id: string; method: "listBookmarks" }
  | { id: string; method: "saveBookmark"; input: SaveBookmarkInput }
  | { id: string; method: "removeBookmark"; bookmarkId: string }
  | { id: string; method: "listPackages" }
  | { id: string; method: "selectPackage"; packageId: string | null };

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
  | { id: string; ok: true; method: "testing"; data: TestingReport | null }
  | { id: string; ok: true; method: "security"; data: SecurityReport | null }
  | {
      id: string;
      ok: true;
      method: "ingestCoverage";
      data: TestingReport | null;
    }
  | { id: string; ok: true; method: "runTests"; data: TestingReport | null }
  | { id: string; ok: true; method: "listTests"; data: TestListResult }
  | { id: string; ok: true; method: "graph"; data: GraphSnapshotDto | null }
  | {
      id: string;
      ok: true;
      method: "impact";
      data: { ok: true; value: ImpactBundle } | { ok: false; error: string };
    }
  | { id: string; ok: true; method: "symbols"; data: SymbolSearchHit[] }
  | {
      id: string;
      ok: true;
      method: "healthHistory";
      data: HealthHistoryReport;
    }
  | {
      id: string;
      ok: true;
      method: "regionMovers";
      data: RegionMoversReport;
    }
  | { id: string; ok: true; method: "healthHistoryBackfill"; data: null }
  | {
      id: string;
      ok: true;
      method: "healthHistoryBackfillStatus";
      data: HealthHistoryBackfillStatus;
    }
  | {
      id: string;
      ok: true;
      method: "engineeringHealth";
      data: EngineeringHealthReport | null;
    }
  | {
      id: string;
      ok: true;
      method: "codeExplorer";
      data: CodeExplorerReport | null;
    }
  | {
      id: string;
      ok: true;
      method: "lighthouseLab";
      data: CwvReport | null;
    }
  | {
      id: string;
      ok: true;
      method: "bundleAnalyze";
      data: BundleWeightReport | null;
    }
  | {
      id: string;
      ok: true;
      method: "detectBundleAnalyze";
      data: BundleAnalyzeCapability;
    }
  | {
      id: string;
      ok: true;
      method: "frontendRoutes";
      data: string[];
    }
  | {
      id: string;
      ok: true;
      method: "domainReport";
      data: DomainReport | null;
    }
  | {
      id: string;
      ok: true;
      method: "prismGitignore";
      data: PrismGitignoreStatus;
    }
  | {
      id: string;
      ok: true;
      method: "addPrismGitignore";
      data: PrismGitignoreStatus;
    }
  | {
      id: string;
      ok: true;
      method: "gitFetch";
      data: { ok: true } | { ok: false; error: string };
    }
  | {
      id: string;
      ok: true;
      method: "applyRename";
      data: ApplyRenameResult;
    }
  | {
      id: string;
      ok: true;
      method: "stageDevopsRemote";
      data: {
        stagedRoot: string;
        paths: string[];
        workflows: Array<{ id?: number; name: string; path: string }>;
        overlay: UtilityOverlayReport | null;
      };
    }
  | {
      id: string;
      ok: true;
      method: "fetchGithubWorkflows";
      data:
        | { ok: true; workflows: GithubWorkflowSummary[] }
        | { ok: false; error: string };
    }
  | {
      id: string;
      ok: true;
      method: "fetchGithubWorkflowRuns";
      data:
        | { ok: true; runs: GithubWorkflowRun[] }
        | { ok: false; error: string };
    }
  | {
      id: string;
      ok: true;
      method: "fetchGithubRepo";
      data: { ok: true; repo: GithubRepoInfo } | { ok: false; error: string };
    }
  | {
      id: string;
      ok: true;
      method: "fetchGithubAuthenticatedLogin";
      data: string | null;
    }
  | {
      id: string;
      ok: true;
      method: "testGithubRepoConnection";
      data:
        | {
            ok: true;
            repo: GithubRepoInfo;
            workflows: GithubWorkflowSummary[];
          }
        | { ok: false; error: string };
    }
  | {
      id: string;
      ok: true;
      method: "dispatchGithubWorkflow";
      data: { ok: true; ref: string } | { ok: false; error: string };
    }
  | {
      id: string;
      ok: true;
      method: "fetchPagespeedMetrics";
      data: { ok: true; raw: unknown } | { ok: false; error: string };
    }
  | {
      id: string;
      ok: true;
      method: "listConsent" | "setConsent";
      data: ConsentState[];
    }
  | {
      id: string;
      ok: true;
      method: "reviewChanges";
      data: ChangeReviewReport;
    }
  | {
      id: string;
      ok: true;
      method: "explainArea";
      data: ExplainAreaSummary | null;
    }
  | { id: string; ok: true; method: "listBookmarks"; data: MapBookmark[] }
  | { id: string; ok: true; method: "saveBookmark"; data: MapBookmark[] }
  | { id: string; ok: true; method: "removeBookmark"; data: MapBookmark[] }
  | {
      id: string;
      ok: true;
      method: "listPackages";
      data: WorkspacePackageInfo[];
    }
  | {
      id: string;
      ok: true;
      method: "selectPackage";
      data: string | null;
    }
  | { id: string; ok: false; error: string };

export type HostToWebview =
  | HostResponse
  | { type: "status"; message: string; kind: "info" | "error" | "loading" }
  | {
      type: "navigate";
      view: AppView;
      domainId?: string;
      /** Reveal-on-map deep link (M-048 Phase 3): repo-relative path to focus. */
      focusPath?: string;
      /** Reveal-on-map deep link by graph node id (takes priority over path). */
      focusNodeId?: string;
      /** Pre-selected target for the Blast / Change Review / Explain screens. */
      targetPath?: string;
      targetPaths?: string[];
      /** Pre-selected blast intent (Safe Delete Check → delete). */
      intent?: "edit" | "delete";
    }
  | { type: "audit"; entry: HostAuditEntry }
  | { type: "codeLensEnabled"; enabled: boolean }
  /** Soft refresh after watch/reindex — keep the current view. */
  | { type: "dataRefresh" }
  /** Force-show the in-app product tour (Settings / command). */
  | { type: "showTour" }
  | {
      type: "lighthouseLabProgress";
      id: string;
      message: string;
      detail?: import("@repo-prism/shared").JsonValue;
    }
  | {
      type: "bundleAnalyzeProgress";
      id: string;
      message: string;
      detail?: import("@repo-prism/shared").JsonValue;
    };

export type WebviewToHost =
  | { type: "ready"; view?: AppView }
  | { type: "request"; request: HostRequest }
  | { type: "openFile"; path: string }
  | { type: "openInBrowser" }
  | { type: "runTests" }
  | { type: "zoom"; zoom: MapZoomLevel }
  | { type: "layers"; layers: MapLayerId[] }
  | { type: "setAutoReindex"; enabled: boolean; intervalMs?: number }
  | { type: "setCodeLens"; enabled: boolean }
  | { type: "setLocalOnly"; enabled: boolean }
  | {
      type: "writePrismConfig";
      excludeGlobs: string[];
      maxFileBytes: number | null;
    }
  | { type: "clearData" };
