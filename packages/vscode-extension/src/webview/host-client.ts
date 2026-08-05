import type {
  BackendReport,
  ChangeReviewReport,
  ConsentPurposeId,
  ConsentState,
  ExplainAreaSummary,
  GraphSnapshotDto,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  SecurityReport,
  TestingReport,
  UtilityOverlayReport,
} from "@prism/shared";
import type { SaveBookmarkInput, WorkspacePackageInfo } from "@prism/core";
import {
  lighthouseProgressFromJobEvent,
  recordAudit,
  withAudit,
} from "@prism/app-shell";
import type { LighthouseLabProgressEvent } from "@prism/app-shell";
import type {
  DashboardPayload,
  HostRequest,
  HostResponse,
  HostToWebview,
  ImpactBundle,
  ImpactTarget,
  MapPayload,
  SymbolSearchHit,
  TestListResult,
  WebviewToHost,
} from "../protocol.js";

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

type ProgressEvent = {
  message: string;
  detail?: import("@prism/shared").JsonValue;
};

type Pending = {
  resolve: (value: HostResponse) => void;
  reject: (err: Error) => void;
  onProgress?: (event: ProgressEvent) => void;
  timer: ReturnType<typeof setTimeout>;
  timeoutMs: number;
  method: string;
};

/**
 * Every request carries a deadline. Without one, a host that dies or drops a
 * message leaves the panel spinning forever with no way back (M-051 Phase 1).
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Operations that stream progress — Lighthouse, bundle analyze, test runs —
 * legitimately take minutes. Their deadline is refreshed by each progress
 * event, so this is the ceiling for silence, not for total duration.
 */
const PROGRESS_TIMEOUT_MS = 5 * 60_000;

const pending = new Map<string, Pending>();
let seq = 0;

function nextId(): string {
  seq += 1;
  return `req-${seq}`;
}

export class HostRequestError extends Error {
  readonly method: string;
  readonly reason: "timeout" | "disposed" | "transport";

  constructor(
    message: string,
    method: string,
    reason: "timeout" | "disposed" | "transport",
  ) {
    super(message);
    this.name = "HostRequestError";
    this.method = method;
    this.reason = reason;
  }
}

function settle(id: string): Pending | undefined {
  const wait = pending.get(id);
  if (!wait) return undefined;
  clearTimeout(wait.timer);
  pending.delete(id);
  return wait;
}

function startDeadline(
  id: string,
  timeoutMs: number,
  method: string,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    const expired = settle(id);
    expired?.reject(
      new HostRequestError(
        `The extension host did not respond to "${method}" within ${Math.round(
          timeoutMs / 1000,
        )}s.`,
        method,
        "timeout",
      ),
    );
  }, timeoutMs);
}

function refreshDeadline(id: string): void {
  const wait = pending.get(id);
  if (!wait) return;
  clearTimeout(wait.timer);
  wait.timer = startDeadline(id, wait.timeoutMs, wait.method);
}

/**
 * Fail every in-flight request. Called when the panel is disposed or reloaded
 * so pending promises reject loudly instead of leaking.
 */
export function abortPendingHostRequests(
  reason = "The Prism panel was reloaded before the request finished.",
): void {
  const inFlight = [...pending.entries()];
  pending.clear();
  for (const [, wait] of inFlight) {
    clearTimeout(wait.timer);
    wait.reject(new HostRequestError(reason, wait.method, "disposed"));
  }
}

/** Host RPC helper — body is a HostRequest without `id` (union members vary). */
function request(
  body: { method: HostRequest["method"] } & Record<string, unknown>,
  options?: {
    onProgress?: (event: ProgressEvent) => void;
    timeoutMs?: number;
  },
): Promise<HostResponse> {
  const id = nextId();
  const full = { ...body, id } as HostRequest;
  const method = String(body.method);
  const timeoutMs =
    options?.timeoutMs ??
    (options?.onProgress ? PROGRESS_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  if (isBrowser || !vscodeApi) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch("/api/host", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(full),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new HostRequestError(
            `Host request "${method}" failed with HTTP ${res.status}.`,
            method,
            "transport",
          );
        }
        return (await res.json()) as HostResponse;
      })
      .catch((error: unknown) => {
        if (error instanceof HostRequestError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new HostRequestError(
            `The Prism host did not respond to "${method}" within ${Math.round(
              timeoutMs / 1000,
            )}s.`,
            method,
            "timeout",
          );
        }
        throw new HostRequestError(
          error instanceof Error
            ? error.message
            : `Host request "${method}" failed.`,
          method,
          "transport",
        );
      })
      .finally(() => clearTimeout(timer));
  }

  return new Promise<HostResponse>((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
      timer: startDeadline(id, timeoutMs, method),
      timeoutMs,
      method,
    });
    vscodeApi!.postMessage({ type: "request", request: full });
  });
}

function forwardProgress(id: string, event: ProgressEvent): void {
  const wait = pending.get(id);
  if (!wait) return;
  // Progress proves the host is alive, so the silence deadline restarts.
  refreshDeadline(id);
  wait.onProgress?.(event);
}

export function handleHostMessage(msg: HostToWebview): void {
  if (!msg || typeof msg !== "object") return;
  if ("type" in msg && msg.type === "lighthouseLabProgress") {
    forwardProgress(msg.id, {
      message: msg.message,
      ...(msg.detail !== undefined ? { detail: msg.detail } : {}),
    });
    return;
  }
  if ("type" in msg && msg.type === "bundleAnalyzeProgress") {
    forwardProgress(msg.id, {
      message: msg.message,
      ...(msg.detail !== undefined ? { detail: msg.detail } : {}),
    });
    return;
  }
  if (!("id" in msg) || typeof (msg as HostResponse).id !== "string") {
    console.warn("[prism] Discarded host message without a request id.", msg);
    return;
  }
  const res = msg as HostResponse;
  const wait = settle(res.id);
  if (!wait) {
    // A response for an unknown id means the request already timed out or the
    // panel reloaded. Silently dropping it hid both cases.
    console.warn(
      `[prism] Received a host response for unknown request "${res.id}" — it may have already timed out.`,
    );
    return;
  }
  wait.resolve(res);
}

const TARGET = "workspace";

export async function fetchDashboard(): Promise<DashboardPayload> {
  return withAudit(
    {
      category: "analysis",
      operation: "Loaded dashboard",
      target: TARGET,
      command: "host:dashboard",
    },
    async () => {
      const res = await request({ method: "dashboard" });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "dashboard") throw new Error("Unexpected response");
      const data = res.data;
      // Distinct DNA-category entries so DNA "Check logs" can filter them.
      if (data.health) {
        recordAudit({
          category: "dna",
          operation: "Computed health score",
          target: TARGET,
          status: "success",
          durationMs: 0,
          command: "host:dashboard → health",
          output: `score=${Math.round(data.health.score)} factors=${data.health.factors.length}`,
        });
      }
      if (data.dna) {
        recordAudit({
          category: "dna",
          operation: "Assembled DNA report",
          target: TARGET,
          status: "success",
          durationMs: 0,
          command: "host:dashboard → dna",
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
}

export async function fetchRepositoryMap(
  zoom: MapZoomLevel,
  layers?: readonly MapLayerId[] | null,
): Promise<MapPayload> {
  const command = `host:map zoom=${zoom}${layers?.length ? ` layers=${layers.join(",")}` : ""}`;
  return withAudit(
    {
      category: "analysis",
      operation: "Loaded repository map",
      target: TARGET,
      command,
    },
    async () => {
      const res = await request({
        method: "map",
        zoom,
        ...(layers && layers.length > 0 ? { layers: [...layers] } : {}),
      });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "map") throw new Error("Unexpected response");
      return res.data;
    },
    (data) => ({
      status: "success",
      output: `nodes=${data.map.graph.nodes.length} edges=${data.map.graph.edges.length}`,
    }),
  );
}

export async function fetchReindex(): Promise<void> {
  return withAudit(
    {
      category: "index",
      operation: "Reindexed workspace",
      target: TARGET,
      command: "host:reindex",
    },
    async () => {
      const res = await request({ method: "reindex" });
      if (!res.ok) throw new Error(res.error);
    },
    () => ({
      status: "success",
      output: "Reindex completed",
    }),
  );
}

export async function fetchOverlay(
  kind: string,
): Promise<UtilityOverlayReport | null> {
  return withAudit(
    {
      category: "integration",
      operation: `Utility overlay: ${kind}`,
      target: TARGET,
      command: `host:overlay kind=${kind}`,
    },
    async () => {
      const res = await request({ method: "overlay", kind });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "overlay") throw new Error("Unexpected response");
      return res.data;
    },
    (data) => {
      if (!data) {
        return { status: "error", output: `Overlay "${kind}" unavailable.` };
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
}

export async function fetchBackendReport(): Promise<BackendReport | null> {
  return withAudit(
    {
      category: "analysis",
      operation: "Computed backend report",
      target: TARGET,
      command: "host:backend",
    },
    async () => {
      const res = await request({ method: "backend" });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "backend") throw new Error("Unexpected response");
      return res.data;
    },
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
}

export async function fetchTestingReport(): Promise<TestingReport | null> {
  return withAudit(
    {
      category: "test",
      operation: "Computed testing report",
      target: TARGET,
      command: "host:testing",
    },
    async () => {
      const res = await request({ method: "testing" });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "testing") throw new Error("Unexpected response");
      return res.data;
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "Testing report unavailable." };
      }
      return {
        status: "success",
        output: `score=${data.score} runners=${data.runners.join(",") || "none"} suites=${data.suites.length}`,
      };
    },
  );
}

export async function fetchSecurityReport(): Promise<SecurityReport | null> {
  return withAudit(
    {
      category: "analysis",
      operation: "Computed security report",
      target: TARGET,
      command: "host:security",
    },
    async () => {
      const res = await request({ method: "security" });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "security") throw new Error("Unexpected response");
      return res.data;
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "Security report unavailable." };
      }
      return {
        status: "success",
        output: `score=${data.score} tools=${data.tools.filter((t) => t.present).length} checks=${data.checks.length}`,
      };
    },
  );
}

export async function ingestCoverage(): Promise<TestingReport | null> {
  return withAudit(
    {
      category: "analysis",
      operation: "Ingested coverage artifacts",
      target: TARGET,
      command: "host:ingestCoverage",
    },
    async () => {
      const res = await request({ method: "ingestCoverage" });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "ingestCoverage")
        throw new Error("Unexpected response");
      return res.data;
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "Coverage ingest unavailable." };
      }
      return {
        status: "success",
        output: data.coverage?.present
          ? `coverage=${data.coverage.linePct ?? "present"} (${data.coverage.source})`
          : "no coverage artifact",
      };
    },
  );
}

export async function runTests(options?: {
  coverage?: boolean;
  path?: string;
  testNamePattern?: string;
}): Promise<TestingReport | null> {
  return withAudit(
    {
      category: "test",
      operation: options?.coverage
        ? "Ran workspace tests with coverage"
        : options?.path || options?.testNamePattern
          ? "Ran filtered workspace tests"
          : "Ran workspace tests",
      target: TARGET,
      command: options?.coverage ? "host:runTests --coverage" : "host:runTests",
    },
    async () => {
      const res = await request({
        method: "runTests",
        ...(options?.coverage ? { coverage: true } : {}),
        ...(options?.path ? { path: options.path } : {}),
        ...(options?.testNamePattern
          ? { testNamePattern: options.testNamePattern }
          : {}),
      });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "runTests") throw new Error("Unexpected response");
      return res.data;
    },
    (data) => {
      if (!data) {
        return {
          status: "error",
          output: "Running tests isn't supported in this host.",
        };
      }
      const passing = data.results.filter((r) => r.status === "passing").length;
      const failing = data.results.filter((r) => r.status === "failing").length;
      return {
        status: failing > 0 ? "error" : "success",
        output: `results=${data.results.length} passing=${passing} failing=${failing}`,
      };
    },
  );
}

export async function listTests(): Promise<TestListResult | null> {
  return withAudit(
    {
      category: "test",
      operation: "Listed workspace tests",
      target: TARGET,
      command: "host:listTests",
    },
    async () => {
      const res = await request({ method: "listTests" });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "listTests") throw new Error("Unexpected response");
      return res.data;
    },
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
}

export async function fetchDependencyGraph(
  _root?: string | null,
): Promise<GraphSnapshotDto | null> {
  return withAudit(
    {
      category: "analysis",
      operation: "Loaded dependency graph",
      target: TARGET,
      command: "host:graph",
    },
    async () => {
      const res = await request({ method: "graph" });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "graph") throw new Error("Unexpected response");
      return res.data;
    },
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
}

export async function fetchImpactBundle(
  target: ImpactTarget,
  _root?: string | null,
): Promise<{ ok: true; value: ImpactBundle } | { ok: false; error: string }> {
  const label =
    target.kind === "symbol"
      ? `symbol:${target.id}`
      : `file:${target.path ?? target.id}`;
  return withAudit(
    {
      category: "impact",
      operation: "Computed impact bundle",
      target: label,
      command: `host:impact ${label}`,
    },
    async () => {
      const res = await request({ method: "impact", target });
      if (!res.ok) return { ok: false as const, error: res.error };
      if (res.method !== "impact") {
        return { ok: false as const, error: "Unexpected response" };
      }
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
}

export async function applyRename(
  input: import("@prism/app-shell").ApplyRenameInput,
): Promise<import("@prism/app-shell").ApplyRenameResult> {
  const res = await request({ method: "applyRename", input });
  if (!res.ok) return { ok: false, error: res.error };
  if (res.method !== "applyRename") {
    return { ok: false, error: "Unexpected response" };
  }
  return res.data;
}

export async function fetchSymbolHits(
  query: string,
  _root?: string | null,
): Promise<SymbolSearchHit[]> {
  return withAudit(
    {
      category: "analysis",
      operation: "Symbol search",
      target: TARGET,
      command: `host:symbols q=${query}`,
    },
    async () => {
      const res = await request({ method: "symbols", query });
      if (!res.ok) return [];
      if (res.method !== "symbols") return [];
      return res.data;
    },
    (hits) => ({
      status: "success",
      output: `hits=${hits.length} query=${query}`,
    }),
  );
}

export async function fetchHealthHistory(): Promise<
  import("@prism/shared").HealthHistoryReport
> {
  const res = await request({ method: "healthHistory" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "healthHistory") throw new Error("Unexpected response");
  return res.data;
}

export async function fetchRegionMovers(): Promise<
  import("@prism/shared").RegionMoversReport
> {
  const res = await request({ method: "regionMovers" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "regionMovers") throw new Error("Unexpected response");
  return res.data;
}

export async function startHealthHistoryBackfill(): Promise<void> {
  const res = await request({ method: "healthHistoryBackfill" });
  if (!res.ok) throw new Error(res.error);
}

export async function fetchHealthHistoryBackfillStatus(): Promise<
  import("@prism/shared").HealthHistoryBackfillStatus
> {
  const res = await request({ method: "healthHistoryBackfillStatus" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "healthHistoryBackfillStatus") {
    throw new Error("Unexpected response");
  }
  return res.data;
}

export async function fetchEngineeringHealth(): Promise<
  import("@prism/shared").EngineeringHealthReport | null
> {
  return withAudit(
    {
      category: "dna",
      operation: "Computed engineering health",
      target: TARGET,
      command: "host:engineeringHealth",
    },
    async () => {
      const res = await request({ method: "engineeringHealth" });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "engineeringHealth")
        throw new Error("Unexpected response");
      return res.data;
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "Engineering health unavailable." };
      }
      return {
        status: "success",
        output: `metrics=${data.metrics.length} git=${data.gitAvailable} hotspots=${data.hotspots.length}`,
      };
    },
  );
}

export async function fetchCodeExplorer(
  target: import("@prism/shared").CodeExplorerTarget,
): Promise<import("@prism/shared").CodeExplorerReport | null> {
  const label =
    target.kind === "file"
      ? target.path
      : `${target.name}${target.path ? `@${target.path}` : ""}`;
  return withAudit(
    {
      category: "analysis",
      operation: "Explored code selection",
      target: TARGET,
      command: `host:codeExplorer:${target.kind}:${label}`,
    },
    async () => {
      const res = await request({ method: "codeExplorer", target });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "codeExplorer") throw new Error("Unexpected response");
      return res.data;
    },
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
}

export async function runLighthouseLab(options?: {
  mode?: "lab-fixture" | "run" | "ingest";
  url?: string;
  port?: number;
  routes?: readonly string[];
  onProgress?: (event: LighthouseLabProgressEvent) => void;
}): Promise<import("@prism/shared").CwvReport | null> {
  return withAudit(
    {
      category: "integration",
      operation: "Lighthouse CWV lab",
      target: TARGET,
      command: `host:lighthouseLab mode=${options?.mode ?? "lab-fixture"}`,
    },
    async () => {
      const res = await request(
        {
          method: "lighthouseLab",
          ...(options?.mode ? { mode: options.mode } : {}),
          ...(options?.url ? { url: options.url } : {}),
          ...(options?.port !== undefined ? { port: options.port } : {}),
          ...(options?.routes && options.routes.length > 0
            ? { routes: [...options.routes] }
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
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "lighthouseLab")
        throw new Error("Unexpected response");
      return res.data;
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
}

export async function detectBundleAnalyzeCapability(options?: {
  packageId?: string;
}): Promise<import("@prism/shared").BundleAnalyzeCapability> {
  const res = await request({
    method: "detectBundleAnalyze",
    ...(options?.packageId ? { packageId: options.packageId } : {}),
  });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "detectBundleAnalyze")
    throw new Error("Unexpected response");
  return res.data;
}

export async function runBundleAnalyze(options?: {
  mode?: "run" | "ingest" | "discover";
  packageId?: string;
  packagePath?: string;
  scriptName?: string;
  reportPath?: string;
  onProgress?: (event: { message: string }) => void;
}): Promise<import("@prism/shared").BundleWeightReport | null> {
  return withAudit(
    {
      category: "integration",
      operation: "Bundle Weight analyze",
      target: TARGET,
      command: `host:bundleAnalyze mode=${options?.mode ?? "run"}`,
    },
    async () => {
      const res = await request(
        {
          method: "bundleAnalyze",
          ...(options?.mode ? { mode: options.mode } : {}),
          ...(options?.packageId ? { packageId: options.packageId } : {}),
          ...(options?.packagePath ? { packagePath: options.packagePath } : {}),
          ...(options?.scriptName ? { scriptName: options.scriptName } : {}),
          ...(options?.reportPath ? { reportPath: options.reportPath } : {}),
        },
        options?.onProgress
          ? {
              onProgress: (raw) => {
                options.onProgress!({ message: raw.message });
              },
            }
          : undefined,
      );
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "bundleAnalyze")
        throw new Error("Unexpected response");
      return res.data;
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
}

export async function reviewChanges(
  paths: readonly string[],
  base?: string,
): Promise<ChangeReviewReport> {
  return withAudit(
    {
      category: "impact",
      operation: "Computed change review",
      target: `${paths.length} path(s)`,
      command: `host:reviewChanges paths=${paths.length}`,
    },
    async () => {
      const res = await request({
        method: "reviewChanges",
        paths: [...paths],
        ...(base ? { base } : {}),
      });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "reviewChanges")
        throw new Error("Unexpected response");
      return res.data;
    },
    (data) => ({
      status: "success",
      output: `overallRisk=${data.overallRisk} affectedFiles=${data.totalAffectedFiles} tests=${data.totalTestsAffected}`,
    }),
  );
}

export async function explainArea(
  path: string,
): Promise<ExplainAreaSummary | null> {
  return withAudit(
    {
      category: "analysis",
      operation: "Explained area",
      target: path,
      command: `host:explainArea ${path}`,
    },
    async () => {
      const res = await request({ method: "explainArea", path });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "explainArea") throw new Error("Unexpected response");
      return res.data;
    },
    (data) => {
      if (!data) return { status: "error", output: "explainArea unavailable." };
      return {
        status: "success",
        output: `domains=${data.domains.join(",") || "none"} in=${data.dependencyDegree.in} out=${data.dependencyDegree.out}`,
      };
    },
  );
}

export async function fetchBookmarks(): Promise<MapBookmark[]> {
  const res = await request({ method: "listBookmarks" });
  if (!res.ok) return [];
  if (res.method !== "listBookmarks") return [];
  return res.data;
}

export async function saveBookmark(
  input: SaveBookmarkInput,
): Promise<MapBookmark[]> {
  const res = await request({ method: "saveBookmark", input });
  if (!res.ok) return [];
  if (res.method !== "saveBookmark") return [];
  return res.data;
}

export async function removeBookmark(
  bookmarkId: string,
): Promise<MapBookmark[]> {
  const res = await request({ method: "removeBookmark", bookmarkId });
  if (!res.ok) return [];
  if (res.method !== "removeBookmark") return [];
  return res.data;
}

export async function fetchPackages(): Promise<WorkspacePackageInfo[]> {
  const res = await request({ method: "listPackages" });
  if (!res.ok) return [];
  if (res.method !== "listPackages") return [];
  return res.data;
}

export async function selectPackage(
  packageId: string | null,
): Promise<string | null> {
  const res = await request({ method: "selectPackage", packageId });
  if (!res.ok) return null;
  if (res.method !== "selectPackage") return null;
  return res.data;
}

export async function discoverFrontendRoutes(): Promise<string[]> {
  const res = await request({ method: "frontendRoutes" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "frontendRoutes") throw new Error("Unexpected response");
  return res.data;
}

export async function listConsent(): Promise<ConsentState[]> {
  const res = await request({ method: "listConsent" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "listConsent") throw new Error("Unexpected response");
  return res.data;
}

export async function setConsent(
  purpose: ConsentPurposeId,
  granted: boolean,
): Promise<ConsentState[]> {
  const res = await request({ method: "setConsent", purpose, granted });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "setConsent") throw new Error("Unexpected response");
  return res.data;
}

export async function stageDevopsRemote(input: {
  owner: string;
  repo: string;
  token?: string;
}): Promise<import("@prism/app-shell").StageDevopsRemoteResult> {
  return withAudit(
    {
      category: "integration",
      operation: "Stage remote DevOps CI",
      target: TARGET,
      command: `host:stageDevopsRemote ${input.owner}/${input.repo}`,
    },
    async () => {
      const res = await request({
        method: "stageDevopsRemote",
        owner: input.owner,
        repo: input.repo,
        ...(input.token ? { token: input.token } : {}),
      });
      if (!res.ok) throw new Error(res.error);
      if (res.method !== "stageDevopsRemote") {
        throw new Error("Unexpected response");
      }
      return res.data;
    },
    (data) => ({
      status: "success",
      output: `staged=${data.paths.length} workflows=${data.workflows.length} root=${data.stagedRoot}`,
    }),
  );
}

export type {
  ImpactBundle,
  ImpactTarget,
  SymbolSearchHit,
  DashboardPayload,
  MapPayload,
};

export async function fetchPrismGitignoreStatus(): Promise<
  import("@prism/app-shell").PrismGitignoreStatus
> {
  const res = await request({ method: "prismGitignore" });
  if (!res.ok) return { ignored: null };
  if (res.method !== "prismGitignore") return { ignored: null };
  return res.data;
}

export async function addPrismGitignore(): Promise<
  import("@prism/app-shell").PrismGitignoreStatus
> {
  const res = await request({ method: "addPrismGitignore" });
  if (!res.ok) return { ignored: null, detail: res.error };
  if (res.method !== "addPrismGitignore") return { ignored: null };
  return res.data;
}

export async function gitFetch(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const res = await request({ method: "gitFetch" });
  if (!res.ok) return { ok: false, error: res.error };
  if (res.method !== "gitFetch") {
    return { ok: false, error: "Unexpected response for gitFetch" };
  }
  return res.data;
}

export function openFile(path: string): void {
  if (isBrowser || !vscodeApi) {
    // Browser has no editor — path stays visible in the UI.
    console.info("[prism] openFile (browser):", path);
    return;
  }
  vscodeApi.postMessage({ type: "openFile", path });
}

export function postToHost(message: WebviewToHost): void {
  if (isBrowser || !vscodeApi) {
    if (message.type === "openInBrowser") return;
    return;
  }
  vscodeApi.postMessage(message);
}

export { vscodeApi as vsCodeApi, isBrowser };
