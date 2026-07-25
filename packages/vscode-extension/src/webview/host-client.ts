import type {
  BackendReport,
  GraphSnapshotDto,
  MapLayerId,
  MapZoomLevel,
  SecurityReport,
  TestingReport,
  UtilityOverlayReport,
} from "@prism/shared";
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

type Pending = {
  resolve: (value: HostResponse) => void;
  reject: (err: Error) => void;
  onProgress?: (event: {
    message: string;
    detail?: import("@prism/shared").JsonValue;
  }) => void;
};

const pending = new Map<string, Pending>();
let seq = 0;

function nextId(): string {
  seq += 1;
  return `req-${seq}`;
}

/** Host RPC helper — body is a HostRequest without `id` (union members vary). */
function request(
  body: { method: HostRequest["method"] } & Record<string, unknown>,
  options?: {
    onProgress?: (event: {
      message: string;
      detail?: import("@prism/shared").JsonValue;
    }) => void;
  },
): Promise<HostResponse> {
  const id = nextId();
  const full = { ...body, id } as HostRequest;

  if (isBrowser || !vscodeApi) {
    return fetch("/api/host", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(full),
    }).then(async (res) => {
      const json = (await res.json()) as HostResponse;
      return json;
    });
  }

  return new Promise<HostResponse>((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
    });
    vscodeApi!.postMessage({ type: "request", request: full });
  });
}

export function handleHostMessage(msg: HostToWebview): void {
  if (!msg || typeof msg !== "object") return;
  if ("type" in msg && msg.type === "lighthouseLabProgress") {
    const wait = pending.get(msg.id);
    wait?.onProgress?.({
      message: msg.message,
      ...(msg.detail !== undefined ? { detail: msg.detail } : {}),
    });
    return;
  }
  if (!("id" in msg) || typeof (msg as HostResponse).id !== "string") return;
  const res = msg as HostResponse;
  const wait = pending.get(res.id);
  if (!wait) return;
  pending.delete(res.id);
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

export async function discoverFrontendRoutes(): Promise<string[]> {
  const res = await request({ method: "frontendRoutes" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "frontendRoutes") throw new Error("Unexpected response");
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
