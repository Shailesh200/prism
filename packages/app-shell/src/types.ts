import type {
  BackendReport,
  BlastRadiusReport,
  ChangeReviewReport,
  DnaReport,
  ExplainAreaSummary,
  GitActivity,
  GitRecentFile,
  GraphSnapshotDto,
  HealthScore,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  RenameImpactReport,
  RepositoryMap,
  SafeDeleteReport,
  TestImpactReport,
  UtilityOverlayReport,
} from "@repo-prism/shared";

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
  /** Edit vs delete emphasis for blast scoring/copy (M-049). */
  intent?: "edit" | "delete";
};

export type SymbolSearchHit = {
  id: string;
  name: string;
  kind: string;
  path: string;
  exported: boolean;
};

/** Single discovered test case (from host `listTests`). */
export type TestListItem = {
  readonly name: string;
  readonly fullName?: string;
};

/** File → tests entry for the Testing suite tree. */
export type TestListFile = {
  readonly path: string;
  readonly tests: readonly TestListItem[];
};

/** Nested suite discovery DTO: folder → file → test (files grouped in UI). */
export type TestListResult = {
  readonly files: readonly TestListFile[];
};

/** Options for host `runTests` (coverage + optional vitest/jest filters). */
export type RunTestsOptions = {
  readonly coverage?: boolean;
  /** File or directory path filter (vitest/jest positional arg). */
  readonly path?: string;
  /** Individual test name pattern (`-t` / `--testNamePattern`). */
  readonly testNamePattern?: string;
};

export type {
  ApplyRenameEditSite,
  ApplyRenameInput,
  ApplyRenameResult,
} from "./apply-rename.js";

/** Package entry for the Mono-v1 package picker (M-048 Phase 6). */
export type WorkspacePackageInfo = {
  readonly id: string;
  readonly name?: string;
  readonly rootDir: string;
  readonly domains: readonly string[];
  readonly personas: readonly string[];
};

/** Upsert input for bookmark persistence (M-048 Phase 6). */
export type SaveBookmarkInput = {
  readonly id?: string;
  readonly label: string;
  readonly path?: string;
  readonly nodeId?: string;
  readonly zoom?: MapZoomLevel;
  readonly note?: string;
  readonly createdAt?: string;
};

/**
 * Whether the workspace's `.prism` folder is covered by `.gitignore`.
 * `ignored` is `null` when the host could not determine the status.
 */
export type PrismGitignoreStatus = {
  readonly ignored: boolean | null;
  /** Optional human-readable detail (e.g. matched pattern or reason). */
  readonly detail?: string;
};

export type {
  BackendReport,
  ChangeReviewReport,
  ExplainAreaSummary,
  GraphSnapshotDto,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
  UtilityOverlayReport,
  GitActivity,
  HealthScore,
  DnaReport,
};
