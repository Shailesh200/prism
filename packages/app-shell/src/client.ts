import type {
  DispatchWorkflowInput,
  GithubCiConfig,
  GithubRepoInfo,
  GithubWorkflowRun,
  GithubWorkflowSummary,
} from "@repo-prism/intelligence/github-ci";
import type {
  BackendReport,
  BundleAnalyzeCapability,
  BundleWeightReport,
  CodeExplorerReport,
  CodeExplorerTarget,
  ConsentPurposeId,
  ConsentState,
  CwvPreferredSource,
  CwvReport,
  DomainReport,
  EngineeringHealthReport,
  GraphSnapshotDto,
  HealthHistoryBackfillStatus,
  HealthHistoryReport,
  MapLayerId,
  MapZoomLevel,
  RegionMoversReport,
  SecurityReport,
  TestingReport,
  UtilityOverlayReport,
} from "@repo-prism/shared";
import type {
  ApplyRenameInput,
  ApplyRenameResult,
  ChangeReviewReport,
  DashboardPayload,
  ExplainAreaSummary,
  ImpactBundle,
  ImpactTarget,
  MapBookmark,
  MapPayload,
  PrismGitignoreStatus,
  RunTestsOptions,
  SaveBookmarkInput,
  SymbolSearchHit,
  TestListResult,
  WorkspacePackageInfo,
} from "./types.js";

export type LighthouseLabProgressEvent = {
  readonly message: string;
  /** Partial merged CWV report after primary / each route finishes. */
  readonly report?: CwvReport;
  /** Route currently under Lighthouse, or null between routes. */
  readonly measuringRoute?: string | null;
  readonly measuredRoutes?: readonly string[];
};

export type LighthouseLabOptions = {
  readonly mode?: "lab-fixture" | "run" | "ingest";
  readonly url?: string;
  readonly port?: number;
  readonly reportPath?: string;
  /** When set, only these routes are measured (first = primary). */
  readonly routes?: readonly string[];
  /** Lab form factor (default mobile simulated throttling). */
  readonly formFactor?: "mobile" | "desktop";
  /** Live build / CLI log lines + progressive CWV while the lab job runs. */
  readonly onProgress?: (event: LighthouseLabProgressEvent) => void;
};

export type BundleAnalyzeProgressEvent = {
  readonly message: string;
  readonly phase?: string;
};

export type BundleAnalyzeOptions = {
  readonly mode?: "run" | "ingest" | "discover";
  readonly packageId?: string;
  readonly packagePath?: string;
  readonly scriptName?: string;
  readonly reportPath?: string;
  readonly onProgress?: (event: BundleAnalyzeProgressEvent) => void;
};

/**
 * Host bridge injected by playground / vscode-extension / browser surfaces.
 * Screens call these methods; implementations come from {@link createPrismClient}
 * over HTTP or postMessage (M-053 Phase 4).
 *
 * Prefer the `PrismClient` alias — same shape, milestone name.
 */
export type AppShellClient = {
  fetchDashboard(): Promise<DashboardPayload>;
  fetchRepositoryMap(
    zoom: MapZoomLevel,
    layers?: readonly MapLayerId[] | null,
  ): Promise<MapPayload>;
  fetchReindex(): Promise<void>;
  fetchOverlay(kind: string): Promise<UtilityOverlayReport | null>;
  fetchBackendReport(): Promise<BackendReport | null>;
  fetchTestingReport?(): Promise<TestingReport | null>;
  fetchSecurityReport?(): Promise<SecurityReport | null>;
  ingestCoverage?(): Promise<TestingReport | null>;
  /**
   * Extension/host-side: run the workspace test command and return the updated
   * {@link TestingReport} (with per-test `results` + `lastRunAt`) so the screen
   * can refresh. Optional so hosts without process execution degrade to a
   * "not supported" message. Pass `{ coverage: true }` to also ingest coverage;
   * optional `path` / `testNamePattern` filter suite/file/individual runs.
   */
  runTests?(options?: RunTestsOptions): Promise<TestingReport | null>;
  /**
   * Discover tests via vitest/jest list APIs for the suite tree UI.
   * Returns `{ files: [] }` or `null` when unsupported.
   */
  listTests?(): Promise<TestListResult | null>;
  fetchDependencyGraph(): Promise<GraphSnapshotDto | null>;
  fetchImpactBundle(
    target: ImpactTarget,
  ): Promise<{ ok: true; value: ImpactBundle } | { ok: false; error: string }>;
  /**
   * Apply a file rename in the open workspace (fs rename + best-effort
   * import/path rewrites in editSites). Symbol rename is preview-only — hosts
   * should reject non-file applies. Optional so read-only surfaces degrade.
   */
  applyRename?(input: ApplyRenameInput): Promise<ApplyRenameResult>;
  fetchSymbolHits(query: string): Promise<SymbolSearchHit[]>;
  /** Playground may load git separately from the dashboard aggregate. */
  fetchGitActivity?(): Promise<import("@repo-prism/shared").GitActivity | null>;
  /**
   * Opt-in Remote Git: run `git fetch --prune` (never push). Used when Remote
   * Git is enabled and the user Syncs Overview.
   */
  gitFetch?(): Promise<{ ok: true } | { ok: false; error: string }>;
  fetchHealthHistory?(): Promise<HealthHistoryReport>;
  fetchRegionMovers?(): Promise<RegionMoversReport>;
  startHealthHistoryBackfill?(): Promise<void>;
  fetchHealthHistoryBackfillStatus?(): Promise<HealthHistoryBackfillStatus>;
  fetchEngineeringHealth?(): Promise<EngineeringHealthReport | null>;
  fetchCodeExplorer?(
    target: CodeExplorerTarget,
  ): Promise<CodeExplorerReport | null>;
  /**
   * Opt-in local Lighthouse / CWV lab (Core `startUtilityJob` + `getCwvReport`).
   * mode=`run` uses system Chrome + CLI under `.prism/tools/lighthouse`.
   */
  runLighthouseLab?(options?: LighthouseLabOptions): Promise<CwvReport | null>;
  /**
   * Detect analyze scripts / Next·Vite·Webpack for Bundle Weight (M-050).
   */
  detectBundleAnalyzeCapability?(options?: {
    packageId?: string;
  }): Promise<BundleAnalyzeCapability>;
  /**
   * Consent-gated local bundle analyze via Core `startUtilityJob` +
   * `getBundleWeightReport`.
   */
  runBundleAnalyze?(
    options?: BundleAnalyzeOptions,
  ): Promise<BundleWeightReport | null>;
  /**
   * Discover frontend URL paths (Next pages + React Router / SEO) for the
   * Routes & components lab section.
   */
  discoverFrontendRoutes?(): Promise<string[]>;
  /**
   * Per-domain aggregation from Core `getDomainReport` (M-053).
   * Pass live CWV reports for frontend so breakdowns match lab / PageSpeed.
   */
  fetchDomainReport?(options?: {
    domain?: DomainReport["domain"];
    cwvLocal?: CwvReport | null;
    cwvPagespeed?: CwvReport | null;
    cwvPreferredSource?: CwvPreferredSource;
    loadLatestCwvArtifact?: boolean;
  }): Promise<DomainReport | null>;
  /**
   * Whether the workspace's `.prism` folder is gitignored. Optional so hosts
   * that cannot determine it simply omit the method (sidebar chip stays hidden).
   */
  fetchPrismGitignoreStatus?(): Promise<PrismGitignoreStatus>;
  /**
   * Append `.prism/` to the workspace root `.gitignore` and return the new
   * status. Optional for hosts that cannot write files.
   */
  addPrismGitignore?(): Promise<PrismGitignoreStatus>;
  /**
   * Stage DevOps signals from a foreign GitHub repo into
   * `.prism/remote-ci/<owner>/<repo>/` (workflows + deploy/k8s markers).
   * Gated in Core on `network.github`, which reads `.prism/consent.json`
   * (ADR-0024, M-036). Surfaces no longer pass a consent flag: a refusal comes
   * back as an error the UI prompts on, so a host that forgets to check its
   * own toggle cannot make the request anyway.
   */
  stageDevopsRemote?(input: {
    owner: string;
    repo: string;
    token?: string;
  }): Promise<StageDevopsRemoteResult>;
  /**
   * Live GitHub Actions workflows / runs / dispatch (Core, `network.github`).
   * Tokens are per-call; Core refuses without consent (ADR-0033).
   */
  fetchGithubWorkflows?(
    cfg: GithubCiConfig,
  ): Promise<
    | { ok: true; workflows: GithubWorkflowSummary[] }
    | { ok: false; error: string }
  >;
  fetchGithubWorkflowRuns?(
    cfg: GithubCiConfig,
    options?: { perPage?: number },
  ): Promise<
    { ok: true; runs: GithubWorkflowRun[] } | { ok: false; error: string }
  >;
  fetchGithubRepo?(
    cfg: GithubCiConfig,
  ): Promise<{ ok: true; repo: GithubRepoInfo } | { ok: false; error: string }>;
  fetchGithubAuthenticatedLogin?(token: string): Promise<string | null>;
  testGithubRepoConnection?(cfg: GithubCiConfig): Promise<
    | {
        ok: true;
        repo: GithubRepoInfo;
        workflows: GithubWorkflowSummary[];
      }
    | { ok: false; error: string }
  >;
  dispatchGithubWorkflow?(
    input: DispatchWorkflowInput,
  ): Promise<{ ok: true; ref: string } | { ok: false; error: string }>;
  /**
   * PageSpeed Insights v5 (Core, `network.pagespeed`). API key is per-call.
   */
  fetchPagespeedMetrics?(
    apiKey: string,
    url: string,
  ): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }>;
  /**
   * Every consent purpose with the decision so far, straight from Core
   * (M-036). Optional only so a host that cannot reach Core degrades to "no
   * grants" — which is the safe answer, not a hidden allow.
   */
  listConsent?(): Promise<readonly ConsentState[]>;
  /** Record the user's answer for one purpose; returns the fresh state. */
  setConsent?(
    purpose: ConsentPurposeId,
    granted: boolean,
  ): Promise<readonly ConsentState[]>;
  openFile?(path: string): void;
  postToHost?(message: unknown): void;
  /**
   * Multi-path aggregate review for SCM / editor "Review Changes" (M-048
   * Phase 4). Optional so read-only surfaces degrade to a not-supported note.
   */
  fetchChangeReview?(
    paths: readonly string[],
    base?: string,
  ): Promise<ChangeReviewReport>;
  /**
   * Deterministic module/folder summary (M-048 Phase 5): domain overlap +
   * dependency degree + local git ownership.
   */
  fetchExplainArea?(path: string): Promise<ExplainAreaSummary | null>;
  /** Bookmarks persisted at `.prism/bookmarks.json` (M-048 Phase 6). */
  fetchBookmarks?(): Promise<MapBookmark[]>;
  saveBookmark?(input: SaveBookmarkInput): Promise<MapBookmark[]>;
  removeBookmark?(id: string): Promise<MapBookmark[]>;
  /** Mono-v1 package picker (M-048 Phase 6). */
  fetchPackages?(): Promise<WorkspacePackageInfo[]>;
  selectPackage?(packageId: string | null): Promise<string | null>;
};

export type StageDevopsRemoteResult = {
  readonly stagedRoot: string;
  readonly paths: readonly string[];
  readonly workflows: readonly {
    readonly id?: number;
    readonly name: string;
    readonly path: string;
  }[];
  readonly overlay: UtilityOverlayReport | null;
};
