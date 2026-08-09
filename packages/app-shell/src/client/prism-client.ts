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
  ChangeReviewReport,
  CodeExplorerReport,
  CodeExplorerTarget,
  ConsentPurposeId,
  ConsentState,
  CwvPreferredSource,
  CwvReport,
  DomainReport,
  EngineeringHealthReport,
  ExplainAreaSummary,
  GitActivity,
  GraphSnapshotDto,
  HealthHistoryBackfillStatus,
  HealthHistoryReport,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  RegionMoversReport,
  SecurityReport,
  TestingReport,
  UtilityOverlayReport,
} from "@repo-prism/shared";
import { lighthouseProgressFromJobEvent } from "../cwv-parse.js";
import { recordAudit, withAudit } from "../audit-log.js";
import type {
  AppShellClient,
  BundleAnalyzeOptions,
  LighthouseLabOptions,
  StageDevopsRemoteResult,
} from "../client.js";
import type {
  ApplyRenameInput,
  ApplyRenameResult,
  DashboardPayload,
  ImpactBundle,
  ImpactTarget,
  MapPayload,
  PrismGitignoreStatus,
  RunTestsOptions,
  SaveBookmarkInput,
  SymbolSearchHit,
  TestListResult,
  WorkspacePackageInfo,
} from "../types.js";
import type { PrismTransport } from "./transport.js";

/** Shared surface client — one implementation, two transports (M-053 Phase 4). */
export type PrismClient = AppShellClient;

export type CreatePrismClientOptions = {
  readonly openFile?: (path: string) => void;
  readonly postToHost?: (message: unknown) => void;
};

function soft<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T | null {
  return result.ok ? result.data : null;
}

function must<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/**
 * Build a {@link PrismClient} whose method bodies (audit + soft-fail policy)
 * live once. Pass {@link createHttpTransport} or {@link createPostMessageTransport}.
 */
export function createPrismClient(
  transport: PrismTransport,
  extras: CreatePrismClientOptions = {},
): PrismClient {
  const target = transport.targetLabel;

  const client: PrismClient = {
    async fetchDashboard(): Promise<DashboardPayload> {
      return withAudit(
        {
          category: "analysis",
          operation: "Loaded dashboard",
          target,
          command: transport.command("dashboard"),
        },
        async () => {
          const res = await transport.invoke<DashboardPayload>("dashboard");
          const data = must(res);
          if (data.health) {
            recordAudit({
              category: "dna",
              operation: "Computed health score",
              target,
              status: "success",
              durationMs: 0,
              command: transport.command("dashboard", "→ health"),
              output: `score=${Math.round(data.health.score)} factors=${data.health.factors.length}`,
            });
          }
          if (data.dna) {
            recordAudit({
              category: "dna",
              operation: "Assembled DNA report",
              target,
              status: "success",
              durationMs: 0,
              command: transport.command("dashboard", "→ dna"),
              output: `domains=${data.dna.rankedDomains?.length ?? 0} primary=${data.dna.primaryDomain ?? "n/a"}`,
            });
          }
          return data;
        },
        (data) => ({
          status: "success",
          output: [
            `health=${data.health ? Math.round(data.health.score) : "n/a"}`,
            `mapNodes=${data.map.graph.nodes.length}`,
            `git=${data.gitActivity?.available ? "yes" : "no"}`,
          ].join("\n"),
        }),
      );
    },

    async fetchRepositoryMap(
      zoom: MapZoomLevel,
      layers?: readonly MapLayerId[] | null,
    ): Promise<MapPayload> {
      const detail = `zoom=${zoom}${layers?.length ? ` layers=${layers.join(",")}` : ""}`;
      return withAudit(
        {
          category: "analysis",
          operation: "Loaded repository map",
          target,
          command: transport.command("map", detail),
        },
        async () => {
          const res = await transport.invoke<MapPayload>("map", {
            zoom,
            ...(layers && layers.length > 0 ? { layers: [...layers] } : {}),
          });
          return must(res);
        },
        (data) => ({
          status: "success",
          output: `nodes=${data.map.graph.nodes.length} edges=${data.map.graph.edges.length}`,
        }),
      );
    },

    async fetchReindex(): Promise<void> {
      return withAudit(
        {
          category: "index",
          operation: "Reindexed workspace",
          target,
          command: transport.command("reindex"),
        },
        async () => {
          const res = await transport.invoke<null>("reindex");
          must(res);
        },
        () => ({ status: "success", output: "Reindex completed" }),
      );
    },

    async fetchOverlay(kind: string): Promise<UtilityOverlayReport | null> {
      return withAudit(
        {
          category: "integration",
          operation: `Utility overlay: ${kind}`,
          target,
          command: transport.command("overlay", `kind=${kind}`),
        },
        async () =>
          soft(
            await transport.invoke<UtilityOverlayReport | null>("overlay", {
              kind,
            }),
          ),
        (data) => {
          if (!data) {
            return {
              status: "error",
              output: `Overlay "${kind}" unavailable.`,
            };
          }
          return {
            status: (data.findings?.length ?? 0) > 0 ? "warning" : "success",
            output: [
              `kind=${data.kind}`,
              `findings=${data.findings?.length ?? 0}`,
              data.summary,
            ].join("\n"),
          };
        },
      );
    },

    async fetchBackendReport(): Promise<BackendReport | null> {
      return withAudit(
        {
          category: "analysis",
          operation: "Computed backend report",
          target,
          command: transport.command("backend"),
        },
        async () =>
          soft(await transport.invoke<BackendReport | null>("backend")),
        (data) => {
          if (!data) {
            return { status: "error", output: "Backend report unavailable." };
          }
          return {
            status: "success",
            output: `endpoints=${data.endpoints.length} frameworks=${data.frameworksDetected.join(",") || "none"}`,
          };
        },
      );
    },

    async fetchTestingReport(): Promise<TestingReport | null> {
      return withAudit(
        {
          category: "test",
          operation: "Computed testing report",
          target,
          command: transport.command("testing"),
        },
        async () =>
          soft(await transport.invoke<TestingReport | null>("testing")),
        (data) => {
          if (!data) {
            return { status: "error", output: "Testing report unavailable." };
          }
          return {
            status: "success",
            output: `score=${data.score} runners=${data.runners.join(",") || "none"}`,
          };
        },
      );
    },

    async fetchSecurityReport(): Promise<SecurityReport | null> {
      return withAudit(
        {
          category: "analysis",
          operation: "Computed security report",
          target,
          command: transport.command("security"),
        },
        async () =>
          soft(await transport.invoke<SecurityReport | null>("security")),
        (data) => {
          if (!data) {
            return { status: "error", output: "Security report unavailable." };
          }
          return {
            status: "success",
            output: `score=${data.score} tools=${data.tools.filter((t) => t.present).length}`,
          };
        },
      );
    },

    async ingestCoverage(): Promise<TestingReport | null> {
      return withAudit(
        {
          category: "analysis",
          operation: "Ingested coverage artifacts",
          target,
          command: transport.command("ingestCoverage"),
        },
        async () =>
          soft(await transport.invoke<TestingReport | null>("ingestCoverage")),
        (data) => {
          if (!data) {
            return { status: "error", output: "Coverage ingest unavailable." };
          }
          return {
            status: "success",
            output: data.coverage?.present
              ? `coverage=${data.coverage.linePct ?? "present"}`
              : "no coverage artifact",
          };
        },
      );
    },

    async runTests(options?: RunTestsOptions): Promise<TestingReport | null> {
      return withAudit(
        {
          category: "test",
          operation: options?.coverage
            ? "Ran workspace tests with coverage"
            : options?.path || options?.testNamePattern
              ? "Ran filtered workspace tests"
              : "Ran workspace tests",
          target,
          command: options?.coverage
            ? transport.command("runTests", "--coverage")
            : transport.command("runTests"),
        },
        async () => {
          const res = await transport.invoke<TestingReport | null>("runTests", {
            ...(options?.coverage ? { coverage: true } : {}),
            ...(options?.path ? { path: options.path } : {}),
            ...(options?.testNamePattern
              ? { testNamePattern: options.testNamePattern }
              : {}),
          });
          return must(res);
        },
        (data) => {
          if (!data) {
            return {
              status: "error",
              output: "Running tests isn't supported in this host.",
            };
          }
          const passing = data.results.filter(
            (r) => r.status === "passing",
          ).length;
          const failing = data.results.filter(
            (r) => r.status === "failing",
          ).length;
          return {
            status: failing > 0 ? "error" : "success",
            output: `results=${data.results.length} passing=${passing} failing=${failing}`,
          };
        },
      );
    },

    async listTests(): Promise<TestListResult | null> {
      return withAudit(
        {
          category: "test",
          operation: "Listed workspace tests",
          target,
          command: transport.command("listTests"),
        },
        async () => soft(await transport.invoke<TestListResult>("listTests")),
        (data) => {
          if (!data) {
            return { status: "error", output: "listTests unavailable." };
          }
          const tests = data.files.reduce((n, f) => n + f.tests.length, 0);
          return {
            status: "success",
            output: `files=${data.files.length} tests=${tests}`,
          };
        },
      );
    },

    async fetchDependencyGraph(): Promise<GraphSnapshotDto | null> {
      return withAudit(
        {
          category: "analysis",
          operation: "Loaded dependency graph",
          target,
          command: transport.command("graph"),
        },
        async () =>
          soft(await transport.invoke<GraphSnapshotDto | null>("graph")),
        (data) => {
          if (!data) {
            return { status: "error", output: "Dependency graph unavailable." };
          }
          return {
            status: "success",
            output: `nodes=${data.nodes.length} edges=${data.edges.length}`,
          };
        },
      );
    },

    async fetchImpactBundle(
      impactTarget: ImpactTarget,
    ): Promise<
      { ok: true; value: ImpactBundle } | { ok: false; error: string }
    > {
      const label =
        impactTarget.kind === "symbol"
          ? `symbol:${impactTarget.id}`
          : `file:${impactTarget.path ?? impactTarget.id}`;
      return withAudit(
        {
          category: "impact",
          operation: "Computed impact bundle",
          target: label,
          command: transport.command("impact", label),
        },
        async () => {
          const res = await transport.invoke<
            { ok: true; value: ImpactBundle } | { ok: false; error: string }
          >("impact", { target: impactTarget });
          if (!res.ok) return { ok: false as const, error: res.error };
          return res.data;
        },
        (data) => {
          if (!data.ok) {
            return { status: "error", output: data.error };
          }
          const blast = data.value.blast;
          return {
            status: "success",
            output: [
              `risk=${blast.risk}`,
              `affectedFiles=${blast.affectedFiles.length}`,
              `tests=${blast.testsLikelyAffected.length}`,
            ].join("\n"),
          };
        },
      );
    },

    async applyRename(input: ApplyRenameInput): Promise<ApplyRenameResult> {
      const res = await transport.invoke<ApplyRenameResult>("applyRename", {
        input,
      });
      if (!res.ok) return { ok: false, error: res.error };
      return res.data;
    },

    async fetchSymbolHits(query: string): Promise<SymbolSearchHit[]> {
      return withAudit(
        {
          category: "analysis",
          operation: "Symbol search",
          target,
          command: transport.command("symbols", `q=${query}`),
        },
        async () => {
          const res = await transport.invoke<SymbolSearchHit[]>("symbols", {
            query,
          });
          return res.ok ? res.data : [];
        },
        (hits) => ({
          status: "success",
          output: `hits=${hits.length} query=${query}`,
        }),
      );
    },

    async fetchGitActivity(): Promise<GitActivity | null> {
      return withAudit(
        {
          category: "git",
          operation: "Loaded git activity",
          target,
          command: transport.command("git"),
        },
        async () => soft(await transport.invoke<GitActivity | null>("git")),
        (data) => {
          if (!data) {
            return {
              status: "error",
              output:
                "Git activity unavailable (not a work tree or request failed).",
            };
          }
          if (!data.available) {
            return {
              status: "warning",
              output: "Root is not a git work tree.",
            };
          }
          return {
            status: "success",
            output: [
              `branch=${data.summary?.branch ?? "unknown"}`,
              `recentCommits=${data.recentCommits.length}`,
              `recentFiles=${data.recentFiles.length}`,
              `dayBuckets=${data.days.length}`,
            ].join("\n"),
          };
        },
      );
    },

    async gitFetch(): Promise<{ ok: true } | { ok: false; error: string }> {
      const res = await transport.invoke<
        { ok: true } | { ok: false; error: string }
      >("gitFetch");
      if (!res.ok) return { ok: false, error: res.error };
      return res.data;
    },

    async fetchHealthHistory(): Promise<HealthHistoryReport> {
      const res = await transport.invoke<HealthHistoryReport>("healthHistory");
      return must(res);
    },

    async fetchRegionMovers(): Promise<RegionMoversReport> {
      const res = await transport.invoke<RegionMoversReport>("regionMovers");
      return must(res);
    },

    async startHealthHistoryBackfill(): Promise<void> {
      const res = await transport.invoke<null>("healthHistoryBackfill");
      must(res);
    },

    async fetchHealthHistoryBackfillStatus(): Promise<HealthHistoryBackfillStatus> {
      const res = await transport.invoke<HealthHistoryBackfillStatus>(
        "healthHistoryBackfillStatus",
      );
      return must(res);
    },

    async fetchEngineeringHealth(): Promise<EngineeringHealthReport | null> {
      return withAudit(
        {
          category: "dna",
          operation: "Computed engineering health",
          target,
          command: transport.command("engineeringHealth"),
        },
        async () =>
          soft(
            await transport.invoke<EngineeringHealthReport | null>(
              "engineeringHealth",
            ),
          ),
        (data) => {
          if (!data) {
            return {
              status: "error",
              output: "Engineering health unavailable.",
            };
          }
          return {
            status: "success",
            output: `metrics=${data.metrics.length} git=${data.gitAvailable}`,
          };
        },
      );
    },

    async fetchCodeExplorer(
      exploreTarget: CodeExplorerTarget,
    ): Promise<CodeExplorerReport | null> {
      const label =
        exploreTarget.kind === "file"
          ? exploreTarget.path
          : `${exploreTarget.name}${exploreTarget.path ? `@${exploreTarget.path}` : ""}`;
      return withAudit(
        {
          category: "analysis",
          operation: "Explored code selection",
          target,
          command: transport.command(
            "codeExplorer",
            `${exploreTarget.kind}:${label}`,
          ),
        },
        async () =>
          soft(
            await transport.invoke<CodeExplorerReport | null>("codeExplorer", {
              target: exploreTarget,
            }),
          ),
        (data) => {
          if (!data) {
            return { status: "error", output: "Code explorer unavailable." };
          }
          return {
            status: "success",
            output: `usages=${data.usages.length} path=${data.path}`,
          };
        },
      );
    },

    async runLighthouseLab(
      options?: LighthouseLabOptions,
    ): Promise<CwvReport | null> {
      return withAudit(
        {
          category: "integration",
          operation: "Lighthouse CWV lab",
          target,
          command: transport.command(
            "lighthouseLab",
            `mode=${options?.mode ?? "lab-fixture"}`,
          ),
        },
        async () => {
          const res = await transport.invoke<CwvReport | null>(
            "lighthouseLab",
            {
              ...(options?.mode ? { mode: options.mode } : {}),
              ...(options?.url ? { url: options.url } : {}),
              ...(options?.port !== undefined ? { port: options.port } : {}),
              ...(options?.routes && options.routes.length > 0
                ? { routes: [...options.routes] }
                : {}),
              ...(options?.formFactor
                ? { formFactor: options.formFactor }
                : {}),
              ...(options?.reportPath
                ? { reportPath: options.reportPath }
                : {}),
            },
            options?.onProgress
              ? {
                  onProgress: (raw) => {
                    options.onProgress!(lighthouseProgressFromJobEvent(raw));
                  },
                }
              : undefined,
          );
          return must(res);
        },
        (data) => {
          if (!data) {
            return { status: "error", output: "Lighthouse lab failed." };
          }
          return {
            status: "success",
            output: `source=${data.source} metrics=${data.metrics.length}`,
          };
        },
      );
    },

    async detectBundleAnalyzeCapability(options?: {
      packageId?: string;
    }): Promise<BundleAnalyzeCapability> {
      const res = await transport.invoke<BundleAnalyzeCapability>(
        "detectBundleAnalyze",
        options?.packageId ? { packageId: options.packageId } : {},
      );
      return must(res);
    },

    async runBundleAnalyze(
      options?: BundleAnalyzeOptions,
    ): Promise<BundleWeightReport | null> {
      return withAudit(
        {
          category: "integration",
          operation: "Bundle Weight analyze",
          target,
          command: transport.command(
            "bundleAnalyze",
            `mode=${options?.mode ?? "run"}`,
          ),
        },
        async () => {
          const res = await transport.invoke<BundleWeightReport | null>(
            "bundleAnalyze",
            {
              ...(options?.mode ? { mode: options.mode } : {}),
              ...(options?.packageId ? { packageId: options.packageId } : {}),
              ...(options?.packagePath
                ? { packagePath: options.packagePath }
                : {}),
              ...(options?.scriptName
                ? { scriptName: options.scriptName }
                : {}),
              ...(options?.reportPath
                ? { reportPath: options.reportPath }
                : {}),
            },
            options?.onProgress
              ? {
                  onProgress: (raw) => {
                    options.onProgress!({ message: raw.message });
                  },
                }
              : undefined,
          );
          return must(res);
        },
        (data) => {
          if (!data) {
            return { status: "error", output: "Bundle analyze failed." };
          }
          return {
            status: "success",
            output: `chunks=${data.overview.chunkCount} total=${data.overview.totalRaw}`,
          };
        },
      );
    },

    async discoverFrontendRoutes(): Promise<string[]> {
      const res = await transport.invoke<string[]>("frontendRoutes");
      return must(res);
    },

    async fetchDomainReport(options?: {
      domain?: DomainReport["domain"];
      cwvLocal?: CwvReport | null;
      cwvPagespeed?: CwvReport | null;
      cwvPreferredSource?: CwvPreferredSource;
      loadLatestCwvArtifact?: boolean;
    }): Promise<DomainReport | null> {
      return withAudit(
        {
          category: "analysis",
          operation: "Computed domain report",
          target,
          command: transport.command("domainReport"),
        },
        async () => {
          const res = await transport.invoke<DomainReport | null>(
            "domainReport",
            {
              domain: options?.domain ?? "frontend",
              ...(options?.cwvLocal !== undefined
                ? { cwvLocal: options.cwvLocal }
                : {}),
              ...(options?.cwvPagespeed !== undefined
                ? { cwvPagespeed: options.cwvPagespeed }
                : {}),
              ...(options?.cwvPreferredSource
                ? { cwvPreferredSource: options.cwvPreferredSource }
                : {}),
              ...(options?.loadLatestCwvArtifact === true
                ? { loadLatestCwvArtifact: true }
                : {}),
            },
          );
          if (!res.ok) return null;
          return res.data;
        },
        (data) => {
          if (!data) {
            return { status: "error", output: "Domain report unavailable." };
          }
          return {
            status: "success",
            output: data.summary,
          };
        },
      );
    },

    async fetchPrismGitignoreStatus(): Promise<PrismGitignoreStatus> {
      const res =
        await transport.invoke<PrismGitignoreStatus>("prismGitignore");
      if (!res.ok) return { ignored: null };
      return res.data;
    },

    async addPrismGitignore(): Promise<PrismGitignoreStatus> {
      const res =
        await transport.invoke<PrismGitignoreStatus>("addPrismGitignore");
      if (!res.ok) return { ignored: null, detail: res.error };
      return res.data;
    },

    async stageDevopsRemote(input: {
      owner: string;
      repo: string;
      token?: string;
    }): Promise<StageDevopsRemoteResult> {
      return withAudit(
        {
          category: "integration",
          operation: "Stage remote DevOps CI",
          target,
          command: transport.command(
            "stageDevopsRemote",
            `${input.owner}/${input.repo}`,
          ),
        },
        async () => {
          const res = await transport.invoke<StageDevopsRemoteResult>(
            "stageDevopsRemote",
            {
              owner: input.owner,
              repo: input.repo,
              ...(input.token ? { token: input.token } : {}),
            },
          );
          return must(res);
        },
        (data) => ({
          status: "success",
          output: `staged=${data.paths.length} workflows=${data.workflows.length}`,
        }),
      );
    },

    async fetchGithubWorkflows(
      cfg: GithubCiConfig,
    ): Promise<
      | { ok: true; workflows: GithubWorkflowSummary[] }
      | { ok: false; error: string }
    > {
      const res = await transport.invoke<
        | { ok: true; workflows: GithubWorkflowSummary[] }
        | { ok: false; error: string }
      >("fetchGithubWorkflows", {
        owner: cfg.owner,
        repo: cfg.repo,
        ...(cfg.token ? { token: cfg.token } : {}),
      });
      if (!res.ok) return { ok: false, error: res.error };
      return res.data;
    },

    async fetchGithubWorkflowRuns(
      cfg: GithubCiConfig,
      options?: { perPage?: number },
    ): Promise<
      { ok: true; runs: GithubWorkflowRun[] } | { ok: false; error: string }
    > {
      const res = await transport.invoke<
        { ok: true; runs: GithubWorkflowRun[] } | { ok: false; error: string }
      >("fetchGithubWorkflowRuns", {
        owner: cfg.owner,
        repo: cfg.repo,
        ...(cfg.token ? { token: cfg.token } : {}),
        ...(options?.perPage !== undefined ? { perPage: options.perPage } : {}),
      });
      if (!res.ok) return { ok: false, error: res.error };
      return res.data;
    },

    async fetchGithubRepo(
      cfg: GithubCiConfig,
    ): Promise<
      { ok: true; repo: GithubRepoInfo } | { ok: false; error: string }
    > {
      const res = await transport.invoke<
        { ok: true; repo: GithubRepoInfo } | { ok: false; error: string }
      >("fetchGithubRepo", {
        owner: cfg.owner,
        repo: cfg.repo,
        ...(cfg.token ? { token: cfg.token } : {}),
      });
      if (!res.ok) return { ok: false, error: res.error };
      return res.data;
    },

    async fetchGithubAuthenticatedLogin(token: string): Promise<string | null> {
      const res = await transport.invoke<string | null>(
        "fetchGithubAuthenticatedLogin",
        { token },
      );
      if (!res.ok) return null;
      return res.data;
    },

    async testGithubRepoConnection(cfg: GithubCiConfig): Promise<
      | {
          ok: true;
          repo: GithubRepoInfo;
          workflows: GithubWorkflowSummary[];
        }
      | { ok: false; error: string }
    > {
      const res = await transport.invoke<
        | {
            ok: true;
            repo: GithubRepoInfo;
            workflows: GithubWorkflowSummary[];
          }
        | { ok: false; error: string }
      >("testGithubRepoConnection", {
        owner: cfg.owner,
        repo: cfg.repo,
        ...(cfg.token ? { token: cfg.token } : {}),
      });
      if (!res.ok) return { ok: false, error: res.error };
      return res.data;
    },

    async dispatchGithubWorkflow(
      input: DispatchWorkflowInput,
    ): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
      // Never put tokens in audit output — only owner/repo/kind.
      return withAudit(
        {
          category: "integration",
          operation: "Dispatch GitHub workflow",
          target,
          command: transport.command(
            "dispatchGithubWorkflow",
            `${input.owner}/${input.repo} kind=${input.kind}`,
          ),
        },
        async () => {
          const res = await transport.invoke<
            { ok: true; ref: string } | { ok: false; error: string }
          >("dispatchGithubWorkflow", {
            owner: input.owner,
            repo: input.repo,
            kind: input.kind,
            ...(input.token ? { token: input.token } : {}),
            ...(input.workflowId !== undefined
              ? { workflowId: input.workflowId }
              : {}),
            ...(input.workflowPath ? { workflowPath: input.workflowPath } : {}),
            ...(input.ref ? { ref: input.ref } : {}),
            ...(input.inputs ? { inputs: input.inputs } : {}),
            ...(input.eventType ? { eventType: input.eventType } : {}),
          });
          if (!res.ok) return { ok: false, error: res.error };
          return res.data;
        },
        (data) => ({
          status: data.ok ? "success" : "error",
          output: data.ok ? `ref=${data.ref}` : data.error,
        }),
      );
    },

    async fetchPagespeedMetrics(
      apiKey: string,
      url: string,
    ): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
      // API key must never appear in audit command/output.
      return withAudit(
        {
          category: "integration",
          operation: "Fetch PageSpeed metrics",
          target,
          command: transport.command("fetchPagespeedMetrics", `url=${url}`),
        },
        async () => {
          const res = await transport.invoke<
            { ok: true; raw: unknown } | { ok: false; error: string }
          >("fetchPagespeedMetrics", { apiKey, url });
          if (!res.ok) return { ok: false, error: res.error };
          return res.data;
        },
        (data) => ({
          status: data.ok ? "success" : "error",
          output: data.ok ? "pagespeed ok" : data.error,
        }),
      );
    },

    async listConsent(): Promise<readonly ConsentState[]> {
      const res = await transport.invoke<ConsentState[]>("listConsent");
      return must(res);
    },

    async setConsent(
      purpose: ConsentPurposeId,
      granted: boolean,
    ): Promise<readonly ConsentState[]> {
      const res = await transport.invoke<ConsentState[]>("setConsent", {
        purpose,
        granted,
      });
      return must(res);
    },

    async fetchChangeReview(
      paths: readonly string[],
      base?: string,
    ): Promise<ChangeReviewReport> {
      return withAudit(
        {
          category: "impact",
          operation: "Computed change review",
          target: `${paths.length} path(s)`,
          command: transport.command("reviewChanges", `paths=${paths.length}`),
        },
        async () => {
          const res = await transport.invoke<ChangeReviewReport>(
            "reviewChanges",
            {
              paths: [...paths],
              ...(base ? { base } : {}),
            },
          );
          return must(res);
        },
        (data) => ({
          status: "success",
          output: `overallRisk=${data.overallRisk} affectedFiles=${data.totalAffectedFiles} tests=${data.totalTestsAffected}`,
        }),
      );
    },

    async fetchExplainArea(path: string): Promise<ExplainAreaSummary | null> {
      return withAudit(
        {
          category: "analysis",
          operation: "Explained area",
          target: path,
          command: transport.command("explainArea", path),
        },
        async () =>
          soft(
            await transport.invoke<ExplainAreaSummary | null>("explainArea", {
              path,
            }),
          ),
        (data) => {
          if (!data)
            return { status: "error", output: "explainArea unavailable." };
          return {
            status: "success",
            output: `domains=${data.domains.join(",") || "none"} in=${data.dependencyDegree.in} out=${data.dependencyDegree.out}`,
          };
        },
      );
    },

    async fetchBookmarks(): Promise<MapBookmark[]> {
      const res = await transport.invoke<MapBookmark[]>("listBookmarks");
      return res.ok ? res.data : [];
    },

    async saveBookmark(input: SaveBookmarkInput): Promise<MapBookmark[]> {
      const res = await transport.invoke<MapBookmark[]>("saveBookmark", {
        input,
      });
      return res.ok ? res.data : [];
    },

    async removeBookmark(id: string): Promise<MapBookmark[]> {
      const res = await transport.invoke<MapBookmark[]>("removeBookmark", {
        bookmarkId: id,
      });
      return res.ok ? res.data : [];
    },

    async fetchPackages(): Promise<WorkspacePackageInfo[]> {
      const res =
        await transport.invoke<WorkspacePackageInfo[]>("listPackages");
      return res.ok ? res.data : [];
    },

    async selectPackage(packageId: string | null): Promise<string | null> {
      const res = await transport.invoke<string | null>("selectPackage", {
        packageId,
      });
      return res.ok ? res.data : null;
    },

    ...(extras.openFile ? { openFile: extras.openFile } : {}),
    ...(extras.postToHost ? { postToHost: extras.postToHost } : {}),
  };

  return client;
}
