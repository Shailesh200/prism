/**
 * Playground map client — thin wrapper over shared {@link createPrismClient}
 * + {@link createHttpTransport} (M-053 Phase 4 / T-09).
 *
 * Method bodies live in `@repo-prism/app-shell`. Named exports keep the
 * historical `(…, root)` signatures used by `App.tsx`.
 */
import type {
  BlastRadiusReport,
  ChangeReviewReport,
  CodeExplorerTarget,
  ConsentPurposeId,
  CwvPreferredSource,
  CwvReport,
  DnaReport,
  DomainReport,
  EngineeringHealthReport,
  GitActivity,
  GraphSnapshotDto,
  HealthHistoryBackfillStatus,
  HealthHistoryReport,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RegionMoversReport,
  RenameImpactReport,
  RepositoryMap,
  SafeDeleteReport,
  TestImpactReport,
  UtilityOverlayReport,
  BackendReport,
  BundleAnalyzeCapability,
  BundleWeightReport,
  SecurityReport,
  TestingReport,
} from "@repo-prism/shared";
import {
  createPlaygroundClient,
  playgroundFetchDna as fetchDnaShared,
  playgroundFetchHealth as fetchHealthShared,
  playgroundFetchPresets,
  type ApplyRenameInput,
  type ApplyRenameResult,
  type LighthouseLabProgressEvent,
  type PlaygroundPreset,
  type PlaygroundPresets,
  type StageDevopsRemoteResult,
  type TestListResult,
} from "@repo-prism/app-shell";

export type { PlaygroundPreset, PlaygroundPresets };

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

function client(root: string | null) {
  return createPlaygroundClient(root);
}

export async function fetchPresets(): Promise<PlaygroundPresets | null> {
  return playgroundFetchPresets();
}

export async function fetchHealth(
  root: string | null,
): Promise<HealthScore | null> {
  return fetchHealthShared(root);
}

export async function fetchDna(root: string | null): Promise<DnaReport | null> {
  return fetchDnaShared(root);
}

export async function gitFetch(
  root: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return client(root).gitFetch!();
}

export async function fetchGitActivity(
  root: string | null,
): Promise<GitActivity | null> {
  return client(root).fetchGitActivity!();
}

export async function fetchHealthHistory(
  root: string | null,
): Promise<HealthHistoryReport> {
  return client(root).fetchHealthHistory!();
}

export async function fetchRegionMovers(
  root: string | null,
): Promise<RegionMoversReport> {
  return client(root).fetchRegionMovers!();
}

export async function startHealthHistoryBackfill(
  root: string | null,
): Promise<void> {
  return client(root).startHealthHistoryBackfill!();
}

export async function fetchHealthHistoryBackfillStatus(
  root: string | null,
): Promise<HealthHistoryBackfillStatus> {
  return client(root).fetchHealthHistoryBackfillStatus!();
}

export async function discoverFrontendRoutes(
  root: string | null,
): Promise<string[]> {
  return client(root).discoverFrontendRoutes!();
}

export async function fetchDomainReport(
  root: string | null,
  options?: {
    domain?: DomainReport["domain"];
    cwvLocal?: CwvReport | null;
    cwvPagespeed?: CwvReport | null;
    cwvPreferredSource?: CwvPreferredSource;
    loadLatestCwvArtifact?: boolean;
  },
): Promise<DomainReport | null> {
  return client(root).fetchDomainReport!(options);
}

export async function runLighthouseLab(
  root: string | null,
  options?: {
    mode?: "lab-fixture" | "run" | "ingest";
    url?: string;
    port?: number;
    routes?: readonly string[];
    onProgress?: (event: LighthouseLabProgressEvent) => void;
  },
): Promise<CwvReport | null> {
  return client(root).runLighthouseLab!(options);
}

export async function detectBundleAnalyzeCapability(
  root: string | null,
  options?: { packageId?: string },
): Promise<BundleAnalyzeCapability> {
  return client(root).detectBundleAnalyzeCapability!(options);
}

export async function runBundleAnalyze(
  root: string | null,
  options?: {
    mode?: "run" | "ingest" | "discover";
    packageId?: string;
    packagePath?: string;
    scriptName?: string;
    reportPath?: string;
    onProgress?: (event: { message: string }) => void;
  },
): Promise<BundleWeightReport | null> {
  return client(root).runBundleAnalyze!(options);
}

export async function fetchConsent(
  root: string | null,
): Promise<readonly import("@repo-prism/shared").ConsentState[]> {
  return client(root).listConsent!();
}

export async function setConsent(
  root: string | null,
  purpose: ConsentPurposeId,
  granted: boolean,
): Promise<readonly import("@repo-prism/shared").ConsentState[]> {
  return client(root).setConsent!(purpose, granted);
}

export async function stageDevopsRemote(
  root: string | null,
  input: {
    owner: string;
    repo: string;
    token?: string;
  },
): Promise<StageDevopsRemoteResult> {
  return client(root).stageDevopsRemote!(input);
}

export async function fetchGithubWorkflows(
  root: string | null,
  ...args: Parameters<
    NonNullable<ReturnType<typeof client>["fetchGithubWorkflows"]>
  >
): ReturnType<NonNullable<ReturnType<typeof client>["fetchGithubWorkflows"]>> {
  return client(root).fetchGithubWorkflows!(...args);
}

export async function fetchGithubWorkflowRuns(
  root: string | null,
  ...args: Parameters<
    NonNullable<ReturnType<typeof client>["fetchGithubWorkflowRuns"]>
  >
): ReturnType<
  NonNullable<ReturnType<typeof client>["fetchGithubWorkflowRuns"]>
> {
  return client(root).fetchGithubWorkflowRuns!(...args);
}

export async function fetchGithubRepo(
  root: string | null,
  ...args: Parameters<NonNullable<ReturnType<typeof client>["fetchGithubRepo"]>>
): ReturnType<NonNullable<ReturnType<typeof client>["fetchGithubRepo"]>> {
  return client(root).fetchGithubRepo!(...args);
}

export async function fetchGithubAuthenticatedLogin(
  root: string | null,
  token: string,
): Promise<string | null> {
  return client(root).fetchGithubAuthenticatedLogin!(token);
}

export async function testGithubRepoConnection(
  root: string | null,
  ...args: Parameters<
    NonNullable<ReturnType<typeof client>["testGithubRepoConnection"]>
  >
): ReturnType<
  NonNullable<ReturnType<typeof client>["testGithubRepoConnection"]>
> {
  return client(root).testGithubRepoConnection!(...args);
}

export async function dispatchGithubWorkflow(
  root: string | null,
  ...args: Parameters<
    NonNullable<ReturnType<typeof client>["dispatchGithubWorkflow"]>
  >
): ReturnType<
  NonNullable<ReturnType<typeof client>["dispatchGithubWorkflow"]>
> {
  return client(root).dispatchGithubWorkflow!(...args);
}

export async function fetchPagespeedMetrics(
  root: string | null,
  apiKey: string,
  url: string,
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  return client(root).fetchPagespeedMetrics!(apiKey, url);
}

export async function fetchOverlay(
  kind: string,
  root: string | null,
): Promise<UtilityOverlayReport | null> {
  return client(root).fetchOverlay(kind);
}

export async function fetchBackendReport(
  root: string | null,
): Promise<BackendReport | null> {
  return client(root).fetchBackendReport();
}

export async function fetchTestingReport(
  root: string | null,
): Promise<TestingReport | null> {
  return client(root).fetchTestingReport!();
}

export async function fetchSecurityReport(
  root: string | null,
): Promise<SecurityReport | null> {
  return client(root).fetchSecurityReport!();
}

export async function fetchEngineeringHealth(
  root: string | null,
): Promise<EngineeringHealthReport | null> {
  return client(root).fetchEngineeringHealth!();
}

export async function fetchCodeExplorer(
  root: string | null,
  target: CodeExplorerTarget,
): Promise<import("@repo-prism/shared").CodeExplorerReport | null> {
  return client(root).fetchCodeExplorer!(target);
}

export async function ingestCoverage(
  root: string | null,
): Promise<TestingReport | null> {
  return client(root).ingestCoverage!();
}

export async function runTests(
  root: string | null,
  options?: {
    coverage?: boolean;
    path?: string;
    testNamePattern?: string;
  },
): Promise<TestingReport | null> {
  return client(root).runTests!(options);
}

export async function listTests(
  root: string | null,
): Promise<TestListResult | null> {
  return client(root).listTests!();
}

export async function fetchDependencyGraph(
  root: string | null,
): Promise<GraphSnapshotDto | null> {
  return client(root).fetchDependencyGraph();
}

export async function fetchImpactBundle(
  target: ImpactTarget,
  root: string | null,
): Promise<{ ok: true; value: ImpactBundle } | { ok: false; error: string }> {
  return client(root).fetchImpactBundle(target);
}

export async function fetchChangeReview(
  paths: readonly string[],
  root: string | null,
  base?: string,
): Promise<ChangeReviewReport> {
  const fn = client(root).fetchChangeReview;
  if (!fn) throw new Error("Change review is not supported on this surface.");
  return fn(paths, base);
}

export async function applyRename(
  input: ApplyRenameInput,
  root: string | null,
): Promise<ApplyRenameResult> {
  return client(root).applyRename!(input);
}

export async function fetchSymbolHits(
  query: string,
  root: string | null,
): Promise<SymbolSearchHit[]> {
  return client(root).fetchSymbolHits(query);
}

/**
 * Load map from Vite Core middleware (dev) or static fixture bundle (build).
 * Returns the bare {@link RepositoryMap} (playground historical signature);
 * {@link PrismClient.fetchRepositoryMap} wraps it as {@link MapPayload}.
 */
export async function fetchRepositoryMap(
  zoom: MapZoomLevel,
  root: string | null = null,
  layers?: readonly MapLayerId[] | null,
): Promise<RepositoryMap> {
  const payload = await client(root).fetchRepositoryMap(zoom, layers);
  return payload.map;
}
