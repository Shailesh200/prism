/** @prism/app-shell — shared Prism product screens (M-046 / ADR-0021). */

export const PACKAGE_NAME = "@prism/app-shell" as const;

export type {
  AppShellClient,
  BundleAnalyzeOptions,
  BundleAnalyzeProgressEvent,
  LighthouseLabOptions,
  LighthouseLabProgressEvent,
  StageDevopsRemoteResult,
} from "./client.js";
export { BundleWeightPanel } from "./BundleWeightPanel.js";
export type {
  BundleWeightPanelHandle,
  BundleWeightPanelProps,
} from "./BundleWeightPanel.js";
export { BundleTreemap } from "./BundleTreemap.js";
export type { BundleTreemapProps, TreemapDatum } from "./BundleTreemap.js";
export { AppShellClientProvider, useAppShellClient } from "./client-context.js";
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
export type { OverviewScreenProps } from "./OverviewScreen.js";
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
  fetchGithubRepo,
  testGithubRepoConnection,
  dispatchGithubWorkflow,
  matchRemoteWorkflowId,
  fetchGithubAuthenticatedLogin,
  fetchGithubWorkflows,
  fetchGithubWorkflowRuns,
  fetchPagespeedMetrics,
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
export { AuditLogsPanel } from "./AuditLogsPanel.js";
export { Avatar } from "./Avatar.js";
export { DOMAIN_CATALOG, type DomainCatalogEntry } from "./domain-catalog.js";
export * from "./overview-model.js";
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
