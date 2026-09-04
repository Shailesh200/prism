/** @repo-prism/app-shell — shared Prism product screens (M-046 / ADR-0021). */

export const PACKAGE_NAME = "@repo-prism/app-shell" as const;

export type {
  AppShellClient,
  BundleAnalyzeOptions,
  BundleAnalyzeProgressEvent,
  LighthouseLabOptions,
  LighthouseLabProgressEvent,
  StageDevopsRemoteResult,
} from "./client.js";
export {
  createPrismClient,
  createHttpTransport,
  createPostMessageTransport,
  createPlaygroundClient,
  httpFetchDna,
  httpFetchHealth,
  httpFetchPresets,
  playgroundFetchDna,
  playgroundFetchHealth,
  playgroundFetchPresets,
  HostRequestError,
  DEFAULT_RPC_TIMEOUT_MS,
  PROGRESS_RPC_TIMEOUT_MS,
  type PrismClient,
  type PrismTransport,
  type CreatePrismClientOptions,
  type HttpTransportOptions,
  type PostMessageTransport,
  type PostMessageTransportOptions,
  type PostMessageRequestEnvelope,
  type TransportInvokeOptions,
  type TransportProgressEvent,
  type TransportResult,
  type PlaygroundPreset,
  type PlaygroundPresets,
} from "./client/index.js";
export { BundleWeightPanel } from "./BundleWeightPanel.js";
export type {
  BundleWeightPanelHandle,
  BundleWeightPanelProps,
} from "./BundleWeightPanel.js";
export { BundleTreemap } from "./BundleTreemap.js";
export type { BundleTreemapProps, TreemapDatum } from "./BundleTreemap.js";
export { AppShellClientProvider, useAppShellClient } from "./client-context.js";
export {
  consentSnapshot,
  isConsentGranted,
  refreshConsent,
  setConsent,
  useConsentGranted,
  useConsentState,
} from "./consent-state.js";
export { isBrowserShell } from "./is-browser.js";
export { shellNavVariant, shellRootClass } from "./shell-layout.js";
export type {
  ApplyRenameEditSite,
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
  TestListFile,
  TestListItem,
  TestListResult,
  WorkspacePackageInfo,
} from "./types.js";
export { resolveRenameToPath, rewritePathReferences } from "./apply-rename.js";

export { PrismErrorBoundary } from "./ErrorBoundary.js";
export type { PrismErrorBoundaryProps } from "./ErrorBoundary.js";
export { OverviewScreen } from "./OverviewScreen.js";
export type { GitStatus, OverviewScreenProps } from "./OverviewScreen.js";
export { DnaScreen } from "./DnaScreen.js";
export type { DnaScreenProps } from "./DnaScreen.js";
export { DomainsScreen } from "./DomainsScreen.js";
export type { DomainsScreenProps } from "./DomainsScreen.js";
export { DomainScreen } from "./DomainScreen.js";
export type { DomainOverlayStatus, DomainScreenProps } from "./DomainScreen.js";
export { TrendsScreen } from "./TrendsScreen.js";
export type { TrendsScreenProps } from "./TrendsScreen.js";
export { BlastRadiusScreen } from "./BlastRadiusScreen.js";
export type { BlastRadiusScreenProps } from "./BlastRadiusScreen.js";
export { ChangeReviewScreen } from "./ChangeReviewScreen.js";
export type { ChangeReviewScreenProps } from "./ChangeReviewScreen.js";
export { ExplainAreaScreen } from "./ExplainAreaScreen.js";
export type { ExplainAreaScreenProps } from "./ExplainAreaScreen.js";
export { SettingsScreen } from "./SettingsScreen.js";
export type {
  SettingsScreenProps,
  SettingsSection,
  SettingsSurface,
} from "./SettingsScreen.js";
export {
  PrismTour,
  clearTourCompleted,
  isTourCompleted,
  markTourCompleted,
  TOUR_STORAGE_KEY,
  type PrismTourProps,
  type TourStep,
} from "./PrismTour.js";
export {
  SETTINGS_STORAGE_KEY,
  DEFAULT_SETTINGS,
  DEFAULT_EXCLUDE_GLOBS,
  MAX_FILE_SIZE_OPTIONS,
  MONO_FONT_OPTIONS,
  SANS_FONT_OPTIONS,
  AUTO_REINDEX_INTERVAL_OPTIONS,
  autoReindexIntervalMs,
  defaultExcludeGlobs,
  loadSettings,
  saveSettings,
  applyAppearance,
  parseExcludeGlobs,
  type PrismSettingsV1,
  type PrismTheme,
  type PrismDensity,
  type PrismMonoFont,
  type PrismSansFont,
  type AutoReindexInterval,
  type MaxFileSizeOption,
} from "./settings-store.js";
export { IntegrationsScreen } from "./IntegrationsScreen.js";
export type { IntegrationsScreenProps } from "./IntegrationsScreen.js";
export {
  INTEGRATIONS_STORAGE_KEY,
  LIGHTHOUSE_FRONTEND_STORAGE_KEY,
  REMOTE_REPOS_STORAGE_KEY,
  loadIntegrationsState,
  saveIntegrationsState,
  clearIntegrationsState,
  isGitIntegrationEnabled,
  loadRemoteRepos,
  saveRemoteRepos,
  upsertRemoteRepo,
  removeRemoteRepo,
  type IntegrationConnection,
  type IntegrationsState,
  type RemoteDevopsRepo,
} from "./integrations-store.js";
export {
  parseGithubRepoRef,
  matchRemoteWorkflowId,
  type GithubCiConfig,
  type GithubWorkflowSummary,
  type GithubWorkflowRun,
  type GithubRepoInfo,
  type DispatchWorkflowInput,
  type DispatchWorkflowKind,
} from "./github-ci.js";
export {
  metricsFromLighthouseJson,
  cwvReportFromLighthouseJson,
  heuristicFrontendRoutes,
  formatCwvValue,
  ratingLabel,
  lighthouseProgressFromJobEvent,
} from "./cwv-parse.js";
export { TestingSecurityScreen } from "./TestingSecurityScreen.js";
export type { TestingSecurityScreenProps } from "./TestingSecurityScreen.js";
export { AppSidebar } from "./AppSidebar.js";
export type { AppSidebarProps, AppSidebarUser, AppView } from "./AppSidebar.js";
export { JobsScreen } from "./JobsScreen.js";
export { ConsoleJobsScreen } from "./ConsoleJobsScreen.js";
export type { ConsoleJobsScreenProps } from "./ConsoleJobsScreen.js";
export type { JobsScreenProps } from "./JobsScreen.js";
export { consoleNote, JobConsole } from "./JobConsole.js";
export { MarkdownDoc } from "./MarkdownDoc.js";
export { parseMarkdown, prepareMarkdown } from "./markdown.js";
export type { JobConsoleProps } from "./JobConsole.js";
export {
  GATE_PATH_SAMPLE,
  gateOverflowNote,
  heartbeatAge,
  isLiveJob,
  isWaitingOnYou,
  jobElapsed,
  jobsWaitingOnYou,
  jobDisplayLabel,
  jobStages,
  jobRailFill,
  jobReviewPending,
  jobAgentLabel,
  jobModelLabel,
  formatWorkerModel,
  formatWorkerThinking,
  unfoldJobSummary,
  splitJobSummary,
  isDispatchNotePath,
  notePathsFromText,
  jobNotePaths,
  parseFabricationMention,
  isSettledJob,
  jobStatusLabel,
  jobStatusTone,
  jobTimeBreakdown,
  mergeConsoleEntries,
  newestEntryTs,
  orderJobsForBoard,
  reviewFileTotals,
  jobBoardKey,
  matchesBoardLane,
  workspaceChipsForBoard,
  type JobBoardLane,
  type JobConfirm,
  type JobConsoleEntry,
  type JobConsolePage,
  type JobStage,
  type JobControlAction,
  type JobControlExtra,
  type JobReview,
  type JobReviewFile,
  type JobReviewFileChange,
  type JobRunPhase,
  type JobStatus as DispatchJobStatus,
  type JobSummary,
  type JobWorkspaceChip,
  type JobsPort,
} from "./jobs-types.js";
export { AuditLogsPanel } from "./AuditLogsPanel.js";
export { Avatar } from "./Avatar.js";
export { DOMAIN_CATALOG, type DomainCatalogEntry } from "./domain-catalog.js";
export * from "./overview-model.js";
export { formatPrismDate, relativePrismTime } from "@repo-prism/ui";
export {
  getAuditEntries,
  subscribeAudit,
  clearAuditLog,
  recordAudit,
  withAudit,
  formatDuration,
  formatAuditTime,
  formatAuditDate,
  relativeAuditTime,
  AUDIT_CATEGORIES,
  type AuditCategory,
  type AuditDiagnostic,
  type AuditEntry,
  type AuditStatus,
} from "./audit-log.js";
export {
  avatarGradient,
  avatarInitials,
  gravatarUrl,
  hashString,
  AVATAR_GRADIENTS,
} from "./avatar-util.js";
export { md5 } from "./md5.js";
