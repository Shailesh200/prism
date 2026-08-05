import type {
  BackendReport,
  BundleAnalyzeCapability,
  BundleWeightReport,
  ChangeReviewReport,
  CodeExplorerReport,
  CodeExplorerTarget,
  CwvReport,
  DnaReport,
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
  RepositoryMap,
  Result,
  PrismError,
  SecurityReport,
  TestingReport,
  UtilityOverlayReport,
} from "@prism/shared";
import {
  Prism,
  PrismErrorCode,
  err,
  ok,
  prismError,
  type PrismClient,
  type PrismWorkspace,
  type RunWorkspaceTestsOptions,
  type SaveBookmarkInput,
  type WorkspacePackageInfo,
  type WorkspaceTestList,
} from "@prism/core";
import type {
  DashboardPayload,
  ImpactBundle,
  ImpactTarget,
  MapPayload,
  SymbolSearchHit,
} from "./protocol.js";

/**
 * Core lifecycle for one workspace folder. No VS Code imports — unit-testable.
 */
export class PrismSession {
  private client: PrismClient | null = null;
  private workspace: PrismWorkspace | null = null;
  private rootPath: string | null = null;

  get root(): string | null {
    return this.rootPath;
  }

  get isOpen(): boolean {
    return this.workspace !== null;
  }

  async open(absoluteRoot: string): Promise<Result<void, PrismError>> {
    this.close();
    this.client = Prism.create();
    const opened = this.client.openRepository(absoluteRoot);
    if (!opened.ok) return opened;
    this.workspace = opened.value;
    this.rootPath = absoluteRoot;
    const indexed = await this.workspace.index();
    if (!indexed.ok) {
      this.close();
      return indexed;
    }
    return ok(undefined);
  }

  async reindex(): Promise<Result<void, PrismError>> {
    if (!this.workspace) {
      return err(
        prismError(
          PrismErrorCode.WORKSPACE_NOT_OPEN,
          "No Prism workspace open",
        ),
      );
    }
    const result = await this.workspace.reindex();
    if (!result.ok) return result;
    return ok(undefined);
  }

  startWatch(options?: {
    debounceMs?: number;
    onChange?: (freshness: import("@prism/core").IndexFreshness) => void;
  }): Result<void, PrismError> {
    if (!this.workspace) {
      return err(
        prismError(
          PrismErrorCode.WORKSPACE_NOT_OPEN,
          "No Prism workspace open",
        ),
      );
    }
    return this.workspace.startWatch(options);
  }

  stopWatch(): Result<void, PrismError> {
    if (!this.workspace) {
      return err(
        prismError(
          PrismErrorCode.WORKSPACE_NOT_OPEN,
          "No Prism workspace open",
        ),
      );
    }
    return this.workspace.stopWatch();
  }

  notifyWatchPaths(input: {
    changedPaths?: readonly string[];
    deletedPaths?: readonly string[];
  }): Result<void, PrismError> {
    if (!this.workspace) {
      return err(
        prismError(
          PrismErrorCode.WORKSPACE_NOT_OPEN,
          "No Prism workspace open",
        ),
      );
    }
    return this.workspace.notifyWatchPaths(input);
  }

  getIndexFreshness(): Result<
    import("@prism/core").IndexFreshness,
    PrismError
  > {
    if (!this.workspace) {
      return err(
        prismError(
          PrismErrorCode.WORKSPACE_NOT_OPEN,
          "No Prism workspace open",
        ),
      );
    }
    return this.workspace.getIndexFreshness();
  }

  private requireWs(): Result<PrismWorkspace, PrismError> {
    if (!this.workspace) {
      return err(
        prismError(
          PrismErrorCode.WORKSPACE_NOT_OPEN,
          "No Prism workspace open",
        ),
      );
    }
    return ok(this.workspace);
  }

  getMap(
    zoom: MapZoomLevel = "package",
    layers?: readonly MapLayerId[],
  ): Result<MapPayload, PrismError> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const map = ws.value.getRepositoryMap({
      zoom,
      ...(layers ? { layers: [...layers] } : {}),
    });
    if (!map.ok) return map;

    const git = ws.value.getGitActivity();
    const recentChanges =
      git.ok && git.value.available ? git.value.recentFiles : [];
    const branch =
      git.ok && git.value.available ? git.value.summary?.branch : undefined;

    return ok({
      map: map.value,
      recentChanges,
      ...(branch !== undefined ? { branch } : {}),
    });
  }

  async getDashboard(
    zoom: MapZoomLevel = "package",
  ): Promise<Result<DashboardPayload, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const root = this.rootPath!;
    const repoLabel = root.split("/").filter(Boolean).pop() ?? root;

    const map = ws.value.getRepositoryMap({ zoom });
    if (!map.ok) return map;

    const git = ws.value.getGitActivity();
    const gitActivity: GitActivity | null = git.ok ? git.value : null;
    const branch =
      gitActivity?.available && gitActivity.summary?.branch
        ? gitActivity.summary.branch
        : undefined;

    const [healthRes, dnaRes, testingRes, securityRes] = await Promise.all([
      ws.value.getHealth(),
      ws.value.getDna(),
      ws.value.getTestingReport(),
      ws.value.getSecurityReport(),
    ]);

    return ok({
      root,
      repoLabel,
      map: map.value,
      gitActivity,
      health: healthRes.ok ? healthRes.value : null,
      dna: dnaRes.ok ? dnaRes.value : null,
      ...(branch !== undefined ? { branch } : {}),
      testingScore: testingRes.ok ? testingRes.value.score : null,
      securityScore: securityRes.ok ? securityRes.value.score : null,
    });
  }

  async getOverlay(
    kind: string,
  ): Promise<Result<UtilityOverlayReport | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.getUtilityOverlay(kind);
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async getBackendReport(): Promise<Result<BackendReport | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.getBackendReport();
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async getTestingReport(): Promise<Result<TestingReport | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.getTestingReport();
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async getSecurityReport(): Promise<
    Result<SecurityReport | null, PrismError>
  > {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.getSecurityReport();
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async ingestCoverageFromWorkspace(): Promise<
    Result<TestingReport | null, PrismError>
  > {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.ingestCoverageFromWorkspace();
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async runWorkspaceTests(
    options: RunWorkspaceTestsOptions = {},
  ): Promise<Result<TestingReport | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.runWorkspaceTests(options);
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async listWorkspaceTests(): Promise<Result<WorkspaceTestList, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.listWorkspaceTests();
    if (!result.ok) return ok({ files: [] });
    return ok(result.value);
  }

  getDependencyGraph(): Result<GraphSnapshotDto | null, PrismError> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = ws.value.getDependencyGraph();
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async getImpact(
    target: ImpactTarget,
  ): Promise<
    Result<
      { ok: true; value: ImpactBundle } | { ok: false; error: string },
      PrismError
    >
  > {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const input = {
      kind: target.kind,
      id: target.id,
      ...(target.path !== undefined ? { path: target.path } : {}),
      ...(target.intent !== undefined ? { intent: target.intent } : {}),
    };
    const renameInput = {
      ...input,
      ...(target.newName !== undefined ? { newName: target.newName } : {}),
    };
    const [blast, safeDelete, rename, testImpact] = await Promise.all([
      ws.value.blastRadius(input),
      ws.value.safeDelete(input),
      ws.value.renameImpact(renameInput),
      ws.value.testImpact(input),
    ]);
    if (!blast.ok) {
      return ok({ ok: false, error: blast.error.message });
    }
    if (!safeDelete.ok) {
      return ok({ ok: false, error: safeDelete.error.message });
    }
    if (!rename.ok) {
      return ok({ ok: false, error: rename.error.message });
    }
    if (!testImpact.ok) {
      return ok({ ok: false, error: testImpact.error.message });
    }
    return ok({
      ok: true,
      value: {
        blast: blast.value,
        safeDelete: safeDelete.value,
        rename: rename.value,
        testImpact: testImpact.value,
      },
    });
  }

  async getHealthHistory(): Promise<Result<HealthHistoryReport, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.getHealthHistory();
  }

  async getRegionMovers(): Promise<Result<RegionMoversReport, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.getRegionMovers();
  }

  async startHealthHistoryBackfill(): Promise<
    Result<HealthHistoryBackfillStatus, PrismError>
  > {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.startHealthHistoryBackfill();
  }

  getHealthHistoryBackfillStatus(): Result<
    HealthHistoryBackfillStatus,
    PrismError
  > {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.getHealthHistoryBackfillStatus();
  }

  async getEngineeringHealth(): Promise<
    Result<EngineeringHealthReport | null, PrismError>
  > {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.getEngineeringHealth();
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async exploreCode(
    target: CodeExplorerTarget,
  ): Promise<Result<CodeExplorerReport | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.exploreCode(target);
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  discoverFrontendRoutes(): Result<string[], PrismError> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.discoverFrontendRoutes();
  }

  async reviewChanges(
    paths: readonly string[],
    base?: string,
  ): Promise<Result<ChangeReviewReport, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.reviewChanges({ paths, ...(base ? { base } : {}) });
  }

  async explainArea(
    path: string,
  ): Promise<Result<ExplainAreaSummary | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const result = await ws.value.explainArea(path);
    if (!result.ok) return ok(null);
    return ok(result.value);
  }

  async listBookmarks(): Promise<Result<MapBookmark[], PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.listBookmarks();
  }

  async saveBookmark(
    input: SaveBookmarkInput,
  ): Promise<Result<MapBookmark[], PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.saveBookmark(input);
  }

  async removeBookmark(id: string): Promise<Result<MapBookmark[], PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.removeBookmark(id);
  }

  async listPackages(): Promise<Result<WorkspacePackageInfo[], PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.listPackages();
  }

  async selectPackage(
    packageId: string | null,
  ): Promise<Result<string | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.selectPackage(packageId);
  }

  async runLighthouseLab(options?: {
    mode?: "lab-fixture" | "run" | "ingest";
    url?: string;
    port?: number;
    routes?: readonly string[];
    onProgress?: (event: {
      message: string;
      detail?: import("@prism/shared").JsonValue;
    }) => void;
  }): Promise<Result<CwvReport | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const mode = options?.mode ?? "lab-fixture";
    const job = await ws.value.startUtilityJob({
      kind: "lighthouse",
      consentGranted: true,
      lighthouse: {
        mode,
        ...(options?.url ? { url: options.url } : {}),
        ...(options?.port !== undefined ? { port: options.port } : {}),
        ...(options?.routes && options.routes.length > 0
          ? { routes: [...options.routes] }
          : {}),
      },
      ...(options?.onProgress
        ? {
            onProgress: (p) => {
              const line = (p.message ?? p.phase).trim();
              if (!line && p.detail === undefined) return;
              options.onProgress!({
                message: line || p.phase,
                ...(p.detail !== undefined ? { detail: p.detail } : {}),
              });
            },
          }
        : {}),
    });
    if (!job.ok) return job;
    if (job.value.status === "failed") {
      return err(
        prismError(
          PrismErrorCode.UNKNOWN,
          job.value.error?.message ??
            "Lighthouse lab failed (no artifact produced).",
        ),
      );
    }
    const artifactId = job.value.resultArtifactId;
    if (!artifactId) {
      return err(
        prismError(
          PrismErrorCode.UNKNOWN,
          "Lighthouse lab produced no CWV artifact.",
        ),
      );
    }
    const cwv = await ws.value.getCwvReport(artifactId);
    if (!cwv.ok) return cwv;
    // mode=run must never surface lab-fixture scores.
    if (mode === "run" && cwv.value.source === "lab-fixture") {
      return err(
        prismError(
          PrismErrorCode.UNKNOWN,
          "Real Lighthouse run unavailable — fixture scores are never shown for mode=run.",
        ),
      );
    }
    return ok(cwv.value);
  }

  async detectBundleAnalyzeCapability(options?: {
    packageId?: string;
  }): Promise<Result<BundleAnalyzeCapability, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    return ws.value.detectBundleAnalyzeCapability(options);
  }

  async runBundleAnalyze(options?: {
    mode?: "run" | "ingest" | "discover";
    packageId?: string;
    packagePath?: string;
    scriptName?: string;
    reportPath?: string;
    onProgress?: (event: {
      message: string;
      detail?: import("@prism/shared").JsonValue;
    }) => void;
  }): Promise<Result<BundleWeightReport | null, PrismError>> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const mode = options?.mode ?? "run";
    const job = await ws.value.startUtilityJob({
      kind: "bundle-stats",
      consentGranted: true,
      ...(options?.packageId ? { packageId: options.packageId } : {}),
      bundleAnalyze: {
        mode,
        ...(options?.packagePath ? { packagePath: options.packagePath } : {}),
        ...(options?.scriptName ? { scriptName: options.scriptName } : {}),
        ...(options?.reportPath ? { reportPath: options.reportPath } : {}),
      },
      ...(options?.onProgress
        ? {
            onProgress: (p) => {
              const line = (p.message ?? p.phase).trim();
              if (!line && p.detail === undefined) return;
              options.onProgress!({
                message: line || p.phase,
                ...(p.detail !== undefined ? { detail: p.detail } : {}),
              });
            },
          }
        : {}),
    });
    if (!job.ok) return job;
    if (job.value.status === "failed") {
      return err(
        prismError(
          PrismErrorCode.UNKNOWN,
          job.value.error?.message ??
            "Bundle analyze failed (no artifact produced).",
        ),
      );
    }
    const artifactId = job.value.resultArtifactId;
    if (!artifactId) {
      return err(
        prismError(
          PrismErrorCode.UNKNOWN,
          "Bundle analyze produced no artifact.",
        ),
      );
    }
    return ws.value.getBundleWeightReport(artifactId);
  }

  findSymbols(query: string): Result<SymbolSearchHit[], PrismError> {
    const ws = this.requireWs();
    if (!ws.ok) return ws;
    const q = query.trim();
    if (q.length < 1) return ok([]);
    // Prefer prefix/exact via Core findSymbol; also try lowercase variants.
    const primary = ws.value.findSymbol({ name: q });
    if (!primary.ok) return ok([]);
    const hits: SymbolSearchHit[] = primary.value.slice(0, 30).map((h) => ({
      id: h.id,
      name: h.name,
      kind: h.kind,
      path: h.path,
      exported: h.exported,
    }));
    if (hits.length > 0) return ok(hits);
    // Fallback: scan file labels in the knowledge graph for path-ish queries.
    const kg = ws.value.getKnowledgeGraph();
    if (!kg.ok) return ok([]);
    const needle = q.toLowerCase();
    const fromGraph: SymbolSearchHit[] = kg.value.graph.nodes
      .filter(
        (n) =>
          n.kind === "symbol" &&
          (n.label.toLowerCase().includes(needle) ||
            String(n.attrs?.["path"] ?? "")
              .toLowerCase()
              .includes(needle)),
      )
      .slice(0, 30)
      .map((n) => ({
        id: n.id,
        name: n.label,
        kind: String(n.attrs?.["kind"] ?? "symbol"),
        path: String(n.attrs?.["path"] ?? ""),
        exported: Boolean(n.attrs?.["exported"]),
      }));
    return ok(fromGraph);
  }

  close(): void {
    if (this.workspace) {
      this.workspace.close();
    }
    this.workspace = null;
    this.client = null;
    this.rootPath = null;
  }
}

// Re-export types used by tests
export type { DnaReport, HealthScore, RepositoryMap, GitRecentFile };
