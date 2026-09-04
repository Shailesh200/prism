/**
 * VS Code webview client — thin wrapper over shared {@link createPrismClient}
 * + {@link createPostMessageTransport} (M-053 Phase 4 / T-09).
 *
 * Method bodies (audit, soft-fail) live in `@repo-prism/app-shell`. This file
 * only wires the vscode postMessage host and re-exports the surface API.
 */
import {
  createPostMessageTransport,
  createPrismClient,
  HostRequestError,
  type PrismClient,
} from "@repo-prism/app-shell";
import type {
  HostToWebview,
  ImpactBundle,
  ImpactTarget,
  SymbolSearchHit,
  DashboardPayload,
  MapPayload,
  WebviewToHost,
} from "@repo-prism/host-session";

export { HostRequestError };
export type {
  ImpactBundle,
  ImpactTarget,
  SymbolSearchHit,
  DashboardPayload,
  MapPayload,
};

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void;
};

type VsCodeApi = { postMessage(message: WebviewToHost): void };

const isBrowser =
  typeof document !== "undefined" &&
  document.body?.getAttribute("data-prism-mode") === "browser";

let vscodeApi: VsCodeApi | null = null;
if (!isBrowser) {
  try {
    vscodeApi = acquireVsCodeApi();
  } catch {
    vscodeApi = null;
  }
}

const transport = createPostMessageTransport({
  postMessage: (message) => {
    vscodeApi?.postMessage(message as WebviewToHost);
  },
  useHttpFallback: isBrowser || !vscodeApi,
  targetLabel: "workspace",
});

const client: PrismClient = createPrismClient(transport, {
  openFile(path: string): void {
    if (isBrowser || !vscodeApi) {
      console.info("[prism] openFile (browser):", path);
      return;
    }
    vscodeApi.postMessage({ type: "openFile", path });
  },
  postToHost(message: unknown): void {
    if (isBrowser || !vscodeApi) {
      const msg = message as WebviewToHost;
      if (msg.type === "openInBrowser") return;
      return;
    }
    vscodeApi.postMessage(message as WebviewToHost);
  },
});

export function handleHostMessage(msg: HostToWebview): void {
  transport.handleMessage(msg);
}

export function abortPendingHostRequests(
  reason = "The Prism panel was reloaded before the request finished.",
): void {
  transport.abort(reason);
}

export const fetchDashboard = (): ReturnType<PrismClient["fetchDashboard"]> =>
  client.fetchDashboard();
export const fetchRepositoryMap = (
  ...args: Parameters<NonNullable<PrismClient["fetchRepositoryMap"]>>
): ReturnType<PrismClient["fetchRepositoryMap"]> =>
  client.fetchRepositoryMap(...args);
export const fetchReindex = (): ReturnType<PrismClient["fetchReindex"]> =>
  client.fetchReindex();
export const fetchOverlay = (
  ...args: Parameters<PrismClient["fetchOverlay"]>
): ReturnType<PrismClient["fetchOverlay"]> => client.fetchOverlay(...args);
export const fetchBackendReport = (): ReturnType<
  PrismClient["fetchBackendReport"]
> => client.fetchBackendReport();
export const fetchTestingReport = (): ReturnType<
  NonNullable<PrismClient["fetchTestingReport"]>
> => client.fetchTestingReport!();
export const fetchSecurityReport = (): ReturnType<
  NonNullable<PrismClient["fetchSecurityReport"]>
> => client.fetchSecurityReport!();
export const ingestCoverage = (): ReturnType<
  NonNullable<PrismClient["ingestCoverage"]>
> => client.ingestCoverage!();
export const runTests = (
  ...args: Parameters<NonNullable<PrismClient["runTests"]>>
): ReturnType<NonNullable<PrismClient["runTests"]>> =>
  client.runTests!(...args);
export const listTests = (): ReturnType<
  NonNullable<PrismClient["listTests"]>
> => client.listTests!();
export const fetchDependencyGraph = (): ReturnType<
  PrismClient["fetchDependencyGraph"]
> => client.fetchDependencyGraph();
export const fetchImpactBundle = (
  ...args: Parameters<PrismClient["fetchImpactBundle"]>
): ReturnType<PrismClient["fetchImpactBundle"]> =>
  client.fetchImpactBundle(...args);
export const applyRename = (
  ...args: Parameters<NonNullable<PrismClient["applyRename"]>>
): ReturnType<NonNullable<PrismClient["applyRename"]>> =>
  client.applyRename!(...args);
export const fetchSymbolHits = (
  ...args: Parameters<PrismClient["fetchSymbolHits"]>
): ReturnType<PrismClient["fetchSymbolHits"]> =>
  client.fetchSymbolHits(...args);
export const fetchHealthHistory = (): ReturnType<
  NonNullable<PrismClient["fetchHealthHistory"]>
> => client.fetchHealthHistory!();
export const fetchRegionMovers = (): ReturnType<
  NonNullable<PrismClient["fetchRegionMovers"]>
> => client.fetchRegionMovers!();
export const startHealthHistoryBackfill = (): ReturnType<
  NonNullable<PrismClient["startHealthHistoryBackfill"]>
> => client.startHealthHistoryBackfill!();
export const fetchHealthHistoryBackfillStatus = (): ReturnType<
  NonNullable<PrismClient["fetchHealthHistoryBackfillStatus"]>
> => client.fetchHealthHistoryBackfillStatus!();
export const fetchEngineeringHealth = (): ReturnType<
  NonNullable<PrismClient["fetchEngineeringHealth"]>
> => client.fetchEngineeringHealth!();
export const fetchCodeExplorer = (
  ...args: Parameters<NonNullable<PrismClient["fetchCodeExplorer"]>>
): ReturnType<NonNullable<PrismClient["fetchCodeExplorer"]>> =>
  client.fetchCodeExplorer!(...args);
export const runLighthouseLab = (
  ...args: Parameters<NonNullable<PrismClient["runLighthouseLab"]>>
): ReturnType<NonNullable<PrismClient["runLighthouseLab"]>> =>
  client.runLighthouseLab!(...args);
export const detectBundleAnalyzeCapability = (
  ...args: Parameters<NonNullable<PrismClient["detectBundleAnalyzeCapability"]>>
): ReturnType<NonNullable<PrismClient["detectBundleAnalyzeCapability"]>> =>
  client.detectBundleAnalyzeCapability!(...args);
export const runBundleAnalyze = (
  ...args: Parameters<NonNullable<PrismClient["runBundleAnalyze"]>>
): ReturnType<NonNullable<PrismClient["runBundleAnalyze"]>> =>
  client.runBundleAnalyze!(...args);
export const reviewChanges = (
  ...args: Parameters<NonNullable<PrismClient["fetchChangeReview"]>>
): ReturnType<NonNullable<PrismClient["fetchChangeReview"]>> =>
  client.fetchChangeReview!(...args);
export const explainArea = (
  ...args: Parameters<NonNullable<PrismClient["fetchExplainArea"]>>
): ReturnType<NonNullable<PrismClient["fetchExplainArea"]>> =>
  client.fetchExplainArea!(...args);
export const fetchBookmarks = (): ReturnType<
  NonNullable<PrismClient["fetchBookmarks"]>
> => client.fetchBookmarks!();
export const saveBookmark = (
  ...args: Parameters<NonNullable<PrismClient["saveBookmark"]>>
): ReturnType<NonNullable<PrismClient["saveBookmark"]>> =>
  client.saveBookmark!(...args);
export const removeBookmark = (
  ...args: Parameters<NonNullable<PrismClient["removeBookmark"]>>
): ReturnType<NonNullable<PrismClient["removeBookmark"]>> =>
  client.removeBookmark!(...args);
export const fetchPackages = (): ReturnType<
  NonNullable<PrismClient["fetchPackages"]>
> => client.fetchPackages!();
export const selectPackage = (
  ...args: Parameters<NonNullable<PrismClient["selectPackage"]>>
): ReturnType<NonNullable<PrismClient["selectPackage"]>> =>
  client.selectPackage!(...args);
export const discoverFrontendRoutes = (): ReturnType<
  NonNullable<PrismClient["discoverFrontendRoutes"]>
> => client.discoverFrontendRoutes!();
export const fetchDomainReport = (
  ...args: Parameters<NonNullable<PrismClient["fetchDomainReport"]>>
): ReturnType<NonNullable<PrismClient["fetchDomainReport"]>> =>
  client.fetchDomainReport!(...args);
export const listConsent = (): ReturnType<
  NonNullable<PrismClient["listConsent"]>
> => client.listConsent!();
export const setConsent = (
  ...args: Parameters<NonNullable<PrismClient["setConsent"]>>
): ReturnType<NonNullable<PrismClient["setConsent"]>> =>
  client.setConsent!(...args);
export const stageDevopsRemote = (
  ...args: Parameters<NonNullable<PrismClient["stageDevopsRemote"]>>
): ReturnType<NonNullable<PrismClient["stageDevopsRemote"]>> =>
  client.stageDevopsRemote!(...args);
export const fetchGithubWorkflows = (
  ...args: Parameters<NonNullable<PrismClient["fetchGithubWorkflows"]>>
): ReturnType<NonNullable<PrismClient["fetchGithubWorkflows"]>> =>
  client.fetchGithubWorkflows!(...args);
export const fetchGithubWorkflowRuns = (
  ...args: Parameters<NonNullable<PrismClient["fetchGithubWorkflowRuns"]>>
): ReturnType<NonNullable<PrismClient["fetchGithubWorkflowRuns"]>> =>
  client.fetchGithubWorkflowRuns!(...args);
export const fetchGithubRepo = (
  ...args: Parameters<NonNullable<PrismClient["fetchGithubRepo"]>>
): ReturnType<NonNullable<PrismClient["fetchGithubRepo"]>> =>
  client.fetchGithubRepo!(...args);
export const fetchGithubAuthenticatedLogin = (
  ...args: Parameters<NonNullable<PrismClient["fetchGithubAuthenticatedLogin"]>>
): ReturnType<NonNullable<PrismClient["fetchGithubAuthenticatedLogin"]>> =>
  client.fetchGithubAuthenticatedLogin!(...args);
export const testGithubRepoConnection = (
  ...args: Parameters<NonNullable<PrismClient["testGithubRepoConnection"]>>
): ReturnType<NonNullable<PrismClient["testGithubRepoConnection"]>> =>
  client.testGithubRepoConnection!(...args);
export const dispatchGithubWorkflow = (
  ...args: Parameters<NonNullable<PrismClient["dispatchGithubWorkflow"]>>
): ReturnType<NonNullable<PrismClient["dispatchGithubWorkflow"]>> =>
  client.dispatchGithubWorkflow!(...args);
export const fetchPagespeedMetrics = (
  ...args: Parameters<NonNullable<PrismClient["fetchPagespeedMetrics"]>>
): ReturnType<NonNullable<PrismClient["fetchPagespeedMetrics"]>> =>
  client.fetchPagespeedMetrics!(...args);
export const fetchPrismGitignoreStatus = (): ReturnType<
  NonNullable<PrismClient["fetchPrismGitignoreStatus"]>
> => client.fetchPrismGitignoreStatus!();
export const addPrismGitignore = (): ReturnType<
  NonNullable<PrismClient["addPrismGitignore"]>
> => client.addPrismGitignore!();
export const gitFetch = (): ReturnType<NonNullable<PrismClient["gitFetch"]>> =>
  client.gitFetch!();

export function openFile(path: string): void {
  client.openFile?.(path);
}

export function postToHost(message: WebviewToHost): void {
  client.postToHost?.(message);
}

export { vscodeApi as vsCodeApi, isBrowser };
