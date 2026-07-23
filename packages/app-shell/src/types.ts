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
  GraphSnapshotDto,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
  UtilityOverlayReport,
  GitActivity,
  HealthScore,
  DnaReport,
};
