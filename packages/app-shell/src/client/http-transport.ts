import type {
  BundleWeightReport,
  CodeExplorerTarget,
  ConsentPurposeId,
  CwvReport,
  DnaReport,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
} from "@repo-prism/shared";
import {
  BlastRadiusReportSchema,
  BundleAnalyzeCapabilitySchema,
  BundleWeightReportSchema,
  ChangeReviewReportSchema,
  CodeExplorerReportSchema,
  CwvReportSchema,
  DomainReportSchema,
  DnaReportSchema,
  EngineeringHealthReportSchema,
  GitActivitySchema,
  GraphSnapshotDtoSchema,
  HealthHistoryBackfillStatusSchema,
  HealthHistoryReportSchema,
  HealthScoreSchema,
  RegionMoversReportSchema,
  RenameImpactReportSchema,
  RepositoryMapSchema,
  SafeDeleteReportSchema,
  TestImpactReportSchema,
  UtilityOverlayReportSchema,
  BackendReportSchema,
  SecurityReportSchema,
  TestingReportSchema,
} from "@repo-prism/shared";
import { recordAudit } from "../audit-log.js";
import type {
  ApplyRenameInput,
  ApplyRenameResult,
  ImpactBundle,
  ImpactTarget,
  MapPayload,
  SymbolSearchHit,
  TestListResult,
} from "../types.js";
import type {
  PrismTransport,
  TransportInvokeOptions,
  TransportResult,
} from "./transport.js";

type FixtureMaps = Partial<Record<MapZoomLevel, RepositoryMap>>;

export type HttpTransportOptions = {
  /** Workspace root for API queries; may change between calls. */
  readonly getRoot: () => string | null;
  readonly fetchImpl?: typeof fetch;
  /** When true (default), fall back to `/fixture-maps.json` if live map fails. */
  readonly allowFixtureMaps?: boolean;
};

/**
 * Playground REST transport. Schema-validates Core payloads (M-051) and keeps
 * NDJSON streaming for Lighthouse / bundle analyze inside the transport.
 */
export function createHttpTransport(
  options: HttpTransportOptions,
): PrismTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const allowFixtureMaps = options.allowFixtureMaps !== false;

  function root(): string | null {
    return options.getRoot();
  }

  function rootParam(params: URLSearchParams): void {
    const r = root();
    if (r) params.set("root", r);
  }

  async function getJson(url: string): Promise<{
    ok: boolean;
    status: number;
    json: unknown;
  }> {
    const res = await fetchImpl(url);
    const json: unknown = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  }

  async function fromApi(
    zoom: MapZoomLevel,
    layers?: readonly MapLayerId[] | null,
  ): Promise<RepositoryMap | null> {
    try {
      const params = new URLSearchParams({ zoom });
      rootParam(params);
      if (layers && layers.length > 0) params.set("layers", layers.join(","));
      const res = await fetchImpl(`/api/map?${params}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        console.warn("map API error", body?.error ?? res.status);
        return null;
      }
      const parsed = RepositoryMapSchema.safeParse(await res.json());
      if (!parsed.success) {
        console.warn("RepositoryMap schema mismatch", parsed.error.flatten());
        return null;
      }
      return parsed.data;
    } catch (error) {
      console.warn("map API fetch failed", error);
      return null;
    }
  }

  async function fromStatic(zoom: MapZoomLevel): Promise<RepositoryMap | null> {
    try {
      const res = await fetchImpl("/fixture-maps.json");
      if (!res.ok) return null;
      const json = (await res.json()) as FixtureMaps;
      const map = json[zoom] ?? json.feature ?? null;
      if (!map) return null;
      const parsed = RepositoryMapSchema.safeParse(map);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async function readNdjsonStream<T>(
    res: Response,
    onEvent: (evt: {
      type?: string;
      message?: string;
      detail?: import("@repo-prism/shared").JsonValue;
      report?: T;
      error?: string;
    }) => void,
  ): Promise<T | null> {
    if (!res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let report: T | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let evt: {
          type?: string;
          message?: string;
          detail?: import("@repo-prism/shared").JsonValue;
          report?: T;
          error?: string;
        };
        try {
          evt = JSON.parse(trimmed) as typeof evt;
        } catch {
          continue;
        }
        onEvent(evt);
        if (evt.type === "report" && evt.report) report = evt.report;
        if (evt.type === "error") {
          throw new Error(evt.error ?? "Stream failed");
        }
      }
    }
    return report;
  }

  async function invoke<T>(
    method: string,
    params: Record<string, unknown> = {},
    invokeOptions?: TransportInvokeOptions,
  ): Promise<TransportResult<T>> {
    try {
      switch (method) {
        case "dashboard":
          return {
            ok: false,
            error: "fetchDashboard is not used by the HTTP playground client",
          };

        case "map": {
          const zoom = params.zoom as MapZoomLevel;
          const layers = params.layers as readonly MapLayerId[] | undefined;
          const live = await fromApi(zoom, layers);
          if (live) {
            return {
              ok: true,
              data: { map: live, recentChanges: [] } as T,
            };
          }
          const r = root();
          if (!r && allowFixtureMaps) {
            const staticMap = await fromStatic(zoom);
            if (staticMap) {
              recordAudit({
                category: "cache",
                operation: "Cache hit: fixture map snapshot",
                target: `zoom=${zoom}`,
                durationMs: 0,
                status: "success",
                command: "GET /fixture-maps.json",
                output: `Served static fixture map for zoom "${zoom}".`,
              });
              return {
                ok: true,
                data: { map: staticMap, recentChanges: [] } as T,
              };
            }
          }
          return {
            ok: false,
            error: r
              ? `Could not index repository at "${r}". Check the path and playground logs.`
              : `No repository map for zoom "${zoom}". Start with bun --filter @repo-prism/playground dev`,
          };
        }

        case "reindex": {
          const mapRes = await invoke<MapPayload>("map", {
            zoom: "feature",
          });
          if (!mapRes.ok) return mapRes as TransportResult<T>;
          return { ok: true, data: null as T };
        }

        case "overlay": {
          const kind = String(params.kind ?? "");
          const qs = new URLSearchParams();
          qs.set("kind", kind);
          rootParam(qs);
          const { ok, json } = await getJson(`/api/overlay?${qs}`);
          if (!ok) return { ok: false, error: `overlay failed` };
          const parsed = UtilityOverlayReportSchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid overlay payload" };
        }

        case "backend": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, json } = await getJson(`/api/backend?${qs}`);
          if (!ok) return { ok: false, error: "backend failed" };
          const parsed = BackendReportSchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid backend payload" };
        }

        case "testing": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, json } = await getJson(`/api/testing?${qs}`);
          if (!ok) return { ok: false, error: "testing failed" };
          const parsed = TestingReportSchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid testing payload" };
        }

        case "security": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, json } = await getJson(`/api/security?${qs}`);
          if (!ok) return { ok: false, error: "security failed" };
          const parsed = SecurityReportSchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid security payload" };
        }

        case "ingestCoverage": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, json } = await getJson(`/api/ingest-coverage?${qs}`);
          if (!ok) return { ok: false, error: "ingest-coverage failed" };
          const parsed = TestingReportSchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid testing payload" };
        }

        case "runTests": {
          const res = await fetchImpl("/api/run-tests", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              root: root() ?? ".",
              ...(params.coverage === true ? { coverage: true } : {}),
              ...(typeof params.path === "string" ? { path: params.path } : {}),
              ...(typeof params.testNamePattern === "string"
                ? { testNamePattern: params.testNamePattern }
                : {}),
            }),
          });
          if (!res.ok) {
            return { ok: false, error: `Run tests failed (${res.status})` };
          }
          const parsed = TestingReportSchema.safeParse(await res.json());
          if (!parsed.success) {
            return {
              ok: false,
              error: "Invalid TestingReport from /api/run-tests",
            };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "listTests": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const res = await fetchImpl(`/api/list-tests?${qs}`);
          if (!res.ok) return { ok: true, data: { files: [] } as T };
          const data = (await res.json()) as TestListResult;
          return {
            ok: true,
            data: (data?.files ? data : { files: [] }) as T,
          };
        }

        case "graph": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, json } = await getJson(`/api/graph?${qs}`);
          if (!ok) return { ok: false, error: "graph failed" };
          const parsed = GraphSnapshotDtoSchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid graph payload" };
        }

        case "impact": {
          const target = params.target as ImpactTarget;
          const qs = new URLSearchParams();
          qs.set("kind", target.kind);
          qs.set("id", target.id);
          rootParam(qs);
          if (target.path) qs.set("path", target.path);
          if (target.newName) qs.set("newName", target.newName);
          if (target.intent) qs.set("intent", target.intent);
          const res = await fetchImpl(`/api/impact?${qs}`);
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            return {
              ok: true,
              data: {
                ok: false,
                error: body?.error ?? `HTTP ${res.status}`,
              } as T,
            };
          }
          const json: unknown = await res.json();
          if (typeof json !== "object" || json === null) {
            return {
              ok: true,
              data: { ok: false, error: "Invalid impact payload" } as T,
            };
          }
          const raw = json as Record<string, unknown>;
          const blast = BlastRadiusReportSchema.safeParse(raw.blast);
          const safeDelete = SafeDeleteReportSchema.safeParse(raw.safeDelete);
          const rename = RenameImpactReportSchema.safeParse(raw.rename);
          const testImpact = TestImpactReportSchema.safeParse(raw.testImpact);
          if (
            !blast.success ||
            !safeDelete.success ||
            !rename.success ||
            !testImpact.success
          ) {
            return {
              ok: true,
              data: { ok: false, error: "Impact schema mismatch" } as T,
            };
          }
          const value: ImpactBundle = {
            blast: blast.data,
            safeDelete: safeDelete.data,
            rename: rename.data,
            testImpact: testImpact.data,
          };
          return { ok: true, data: { ok: true, value } as T };
        }

        case "applyRename": {
          const input = params.input as ApplyRenameInput;
          const res = await fetchImpl("/api/apply-rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(root() ? { root: root() } : {}),
              input,
            }),
          });
          const json = (await res.json()) as
            | ApplyRenameResult
            | { error?: string };
          if (!res.ok) {
            return {
              ok: true,
              data: {
                ok: false,
                error:
                  "error" in json && typeof json.error === "string"
                    ? json.error
                    : `HTTP ${res.status}`,
              } as T,
            };
          }
          if (
            json &&
            typeof json === "object" &&
            "ok" in json &&
            typeof json.ok === "boolean"
          ) {
            return { ok: true, data: json as T };
          }
          return {
            ok: true,
            data: { ok: false, error: "Invalid apply-rename response" } as T,
          };
        }

        case "symbols": {
          const q = String(params.query ?? "").trim();
          if (q.length < 1) return { ok: true, data: [] as T };
          const qs = new URLSearchParams({ q });
          rootParam(qs);
          const res = await fetchImpl(`/api/symbols?${qs}`);
          if (!res.ok) return { ok: true, data: [] as T };
          const json = (await res.json()) as { hits?: SymbolSearchHit[] };
          return {
            ok: true,
            data: (Array.isArray(json.hits) ? json.hits : []) as T,
          };
        }

        case "git": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, json } = await getJson(`/api/git?${qs}`);
          if (!ok) return { ok: false, error: "git failed" };
          const parsed = GitActivitySchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid git activity payload" };
        }

        case "gitFetch": {
          const res = await fetchImpl("/api/git-fetch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ root: root() ?? "." }),
          });
          if (!res.ok) {
            return {
              ok: true,
              data: { ok: false, error: `HTTP ${res.status}` } as T,
            };
          }
          const data = (await res.json()) as {
            ok?: boolean;
            error?: string;
          };
          if (data.ok === true) {
            return { ok: true, data: { ok: true } as T };
          }
          return {
            ok: true,
            data: {
              ok: false,
              error: data.error ?? "git fetch failed",
            } as T,
          };
        }

        case "healthHistory": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, status, json } = await getJson(
            `/api/health-history?${qs}`,
          );
          if (!ok) {
            return { ok: false, error: `health-history failed: ${status}` };
          }
          const parsed = HealthHistoryReportSchema.safeParse(json);
          if (!parsed.success) {
            return { ok: false, error: "Invalid health history payload" };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "regionMovers": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, status, json } = await getJson(
            `/api/region-movers?${qs}`,
          );
          if (!ok) {
            return { ok: false, error: `region-movers failed: ${status}` };
          }
          const parsed = RegionMoversReportSchema.safeParse(json);
          if (!parsed.success) {
            return { ok: false, error: "Invalid region movers payload" };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "healthHistoryBackfill": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const res = await fetchImpl(`/api/health-history/backfill?${qs}`, {
            method: "POST",
          });
          if (!res.ok) {
            return {
              ok: false,
              error: `health-history backfill failed: ${res.status}`,
            };
          }
          return { ok: true, data: null as T };
        }

        case "healthHistoryBackfillStatus": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, status, json } = await getJson(
            `/api/health-history/backfill?${qs}`,
          );
          if (!ok) {
            return {
              ok: false,
              error: `health-history backfill status failed: ${status}`,
            };
          }
          const parsed = HealthHistoryBackfillStatusSchema.safeParse(json);
          if (!parsed.success) {
            return { ok: false, error: "Invalid backfill status payload" };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "engineeringHealth": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, json } = await getJson(`/api/engineering-health?${qs}`);
          if (!ok) return { ok: false, error: "engineering-health failed" };
          const parsed = EngineeringHealthReportSchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid engineering health payload" };
        }

        case "codeExplorer": {
          const exploreTarget = params.target as CodeExplorerTarget;
          const qs = new URLSearchParams();
          rootParam(qs);
          qs.set("kind", exploreTarget.kind);
          if (exploreTarget.kind === "file") {
            qs.set("path", exploreTarget.path);
          } else {
            qs.set("name", exploreTarget.name);
            if (exploreTarget.path) qs.set("path", exploreTarget.path);
          }
          const { ok, json } = await getJson(`/api/code-explorer?${qs}`);
          if (!ok || json === null) {
            return { ok: false, error: "code-explorer failed" };
          }
          const parsed = CodeExplorerReportSchema.safeParse(json);
          return parsed.success
            ? { ok: true, data: parsed.data as T }
            : { ok: false, error: "Invalid code explorer payload" };
        }

        case "lighthouseLab": {
          const qs = new URLSearchParams();
          rootParam(qs);
          qs.set("mode", String(params.mode ?? "lab-fixture"));
          if (typeof params.url === "string") qs.set("url", params.url);
          if (params.port !== undefined) qs.set("port", String(params.port));
          if (Array.isArray(params.routes) && params.routes.length > 0) {
            qs.set("routes", params.routes.join(","));
          }
          if (
            params.formFactor === "mobile" ||
            params.formFactor === "desktop"
          ) {
            qs.set("formFactor", params.formFactor);
          }
          if (params.mode === "run" || invokeOptions?.onProgress) {
            qs.set("stream", "1");
          }
          const res = await fetchImpl(`/api/lighthouse?${qs}`);
          if (!res.ok) {
            let detail = `Lighthouse lab failed (${res.status})`;
            try {
              const body = (await res.json()) as { error?: string };
              if (body.error) detail = body.error;
            } catch {
              /* ignore */
            }
            return { ok: false, error: detail };
          }
          const contentType = res.headers.get("content-type") ?? "";
          if (contentType.includes("ndjson") && res.body) {
            const report = await readNdjsonStream<CwvReport>(res, (evt) => {
              if (evt.type === "progress" && (evt.message || evt.detail)) {
                invokeOptions?.onProgress?.({
                  message: evt.message ?? "",
                  ...(evt.detail !== undefined ? { detail: evt.detail } : {}),
                });
              }
            });
            if (!report) {
              return {
                ok: false,
                error: "Lighthouse stream ended without a report",
              };
            }
            const parsed = CwvReportSchema.safeParse(report);
            if (!parsed.success) {
              return {
                ok: false,
                error: "Invalid CWV report payload from Lighthouse lab",
              };
            }
            return { ok: true, data: parsed.data as T };
          }
          const parsed = CwvReportSchema.safeParse(await res.json());
          if (!parsed.success) {
            return {
              ok: false,
              error: "Invalid CWV report payload from Lighthouse lab",
            };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "detectBundleAnalyze": {
          const qs = new URLSearchParams();
          rootParam(qs);
          if (typeof params.packageId === "string") {
            qs.set("packageId", params.packageId);
          }
          const { ok, status, json } = await getJson(
            `/api/detect-bundle-analyze?${qs}`,
          );
          if (!ok) {
            return {
              ok: false,
              error: `detect-bundle-analyze failed: ${status}`,
            };
          }
          const parsed = BundleAnalyzeCapabilitySchema.safeParse(json);
          if (!parsed.success) {
            return {
              ok: false,
              error: "Invalid BundleAnalyzeCapability payload",
            };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "bundleAnalyze": {
          const qs = new URLSearchParams();
          rootParam(qs);
          qs.set("mode", String(params.mode ?? "run"));
          if (typeof params.packageId === "string") {
            qs.set("packageId", params.packageId);
          }
          if (typeof params.packagePath === "string") {
            qs.set("packagePath", params.packagePath);
          }
          if (typeof params.scriptName === "string") {
            qs.set("scriptName", params.scriptName);
          }
          if (typeof params.reportPath === "string") {
            qs.set("reportPath", params.reportPath);
          }
          qs.set("stream", "1");
          const res = await fetchImpl(`/api/bundle-analyze?${qs}`);
          if (!res.ok) {
            let detail = `Bundle analyze failed (${res.status})`;
            try {
              const body = (await res.json()) as { error?: string };
              if (body.error) detail = body.error;
            } catch {
              /* ignore */
            }
            return { ok: false, error: detail };
          }
          const contentType = res.headers.get("content-type") ?? "";
          if (contentType.includes("ndjson") && res.body) {
            const report = await readNdjsonStream<BundleWeightReport>(
              res,
              (evt) => {
                if (evt.type === "progress" && evt.message) {
                  invokeOptions?.onProgress?.({ message: evt.message });
                }
              },
            );
            if (!report) {
              return {
                ok: false,
                error: "Bundle stream ended without a report",
              };
            }
            const parsed = BundleWeightReportSchema.safeParse(report);
            if (!parsed.success) {
              return { ok: false, error: "Invalid BundleWeightReport payload" };
            }
            return { ok: true, data: parsed.data as T };
          }
          const parsed = BundleWeightReportSchema.safeParse(await res.json());
          if (!parsed.success) {
            return { ok: false, error: "Invalid BundleWeightReport payload" };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "frontendRoutes": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const { ok, status, json } = await getJson(
            `/api/frontend-routes?${qs}`,
          );
          if (!ok) {
            return { ok: false, error: `frontend-routes failed: ${status}` };
          }
          const body = json as { routes?: string[]; error?: string };
          if (body.error) return { ok: false, error: body.error };
          return {
            ok: true,
            data: (Array.isArray(body.routes) ? body.routes : ["/"]) as T,
          };
        }

        case "domainReport": {
          const qs = new URLSearchParams();
          rootParam(qs);
          const res = await fetchImpl(`/api/domain-report?${qs}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              domain: (params.domain as string | undefined) ?? "frontend",
              ...(params.cwvLocal !== undefined
                ? { cwvLocal: params.cwvLocal }
                : {}),
              ...(params.cwvPagespeed !== undefined
                ? { cwvPagespeed: params.cwvPagespeed }
                : {}),
              ...(typeof params.cwvPreferredSource === "string"
                ? { cwvPreferredSource: params.cwvPreferredSource }
                : {}),
              ...(params.loadLatestCwvArtifact === true
                ? { loadLatestCwvArtifact: true }
                : {}),
            }),
          });
          if (!res.ok) {
            return { ok: false, error: `domain-report failed: ${res.status}` };
          }
          const parsed = DomainReportSchema.safeParse(await res.json());
          if (!parsed.success) {
            return { ok: false, error: "Invalid DomainReport payload" };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "listConsent": {
          const res = await fetchImpl(
            `/api/consent?root=${encodeURIComponent(root() ?? ".")}`,
          );
          if (!res.ok) {
            return { ok: false, error: `consent failed: ${res.status}` };
          }
          return {
            ok: true,
            data: (await res.json()) as T,
          };
        }

        case "setConsent": {
          const res = await fetchImpl("/api/consent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              root: root() ?? ".",
              purpose: params.purpose as ConsentPurposeId,
              granted: Boolean(params.granted),
            }),
          });
          if (!res.ok) {
            return { ok: false, error: `consent failed: ${res.status}` };
          }
          return {
            ok: true,
            data: (await res.json()) as T,
          };
        }

        case "stageDevopsRemote": {
          const res = await fetchImpl("/api/stage-devops-remote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              root: root() ?? ".",
              owner: params.owner,
              repo: params.repo,
              ...(typeof params.token === "string"
                ? { token: params.token }
                : {}),
            }),
          });
          const json: unknown = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err =
              json &&
              typeof json === "object" &&
              typeof (json as { error?: unknown }).error === "string"
                ? (json as { error: string }).error
                : `stage-devops-remote failed: ${res.status}`;
            return { ok: false, error: err };
          }
          return { ok: true, data: json as T };
        }

        case "fetchGithubWorkflows":
        case "fetchGithubWorkflowRuns":
        case "fetchGithubRepo":
        case "fetchGithubAuthenticatedLogin":
        case "testGithubRepoConnection":
        case "dispatchGithubWorkflow": {
          const res = await fetchImpl("/api/github-ci", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              root: root() ?? ".",
              action: method,
              ...params,
            }),
          });
          const json: unknown = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err =
              json &&
              typeof json === "object" &&
              typeof (json as { error?: unknown }).error === "string"
                ? (json as { error: string }).error
                : `github-ci failed: ${res.status}`;
            return { ok: false, error: err };
          }
          return { ok: true, data: json as T };
        }

        case "fetchPagespeedMetrics": {
          const res = await fetchImpl("/api/pagespeed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              root: root() ?? ".",
              apiKey: params.apiKey,
              url: params.url,
            }),
          });
          const json: unknown = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err =
              json &&
              typeof json === "object" &&
              typeof (json as { error?: unknown }).error === "string"
                ? (json as { error: string }).error
                : `pagespeed failed: ${res.status}`;
            return { ok: false, error: err };
          }
          return { ok: true, data: json as T };
        }

        case "prismGitignore": {
          try {
            const qs = new URLSearchParams();
            rootParam(qs);
            const res = await fetchImpl(`/api/gitignore?${qs}`);
            if (!res.ok) {
              return { ok: true, data: { ignored: null } as T };
            }
            return {
              ok: true,
              data: (await res.json()) as T,
            };
          } catch {
            return { ok: true, data: { ignored: null } as T };
          }
        }

        case "addPrismGitignore": {
          try {
            const res = await fetchImpl("/api/add-gitignore", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ root: root() }),
            });
            if (!res.ok) {
              return { ok: true, data: { ignored: null } as T };
            }
            return {
              ok: true,
              data: (await res.json()) as T,
            };
          } catch {
            return { ok: true, data: { ignored: null } as T };
          }
        }

        case "reviewChanges": {
          const res = await fetchImpl("/api/review", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              root: root() ?? ".",
              paths: Array.isArray(params.paths) ? params.paths : [],
              ...(typeof params.base === "string" ? { base: params.base } : {}),
            }),
          });
          if (!res.ok) {
            return {
              ok: false,
              error: `Review changes failed (${res.status})`,
            };
          }
          const parsed = ChangeReviewReportSchema.safeParse(await res.json());
          if (!parsed.success) {
            return {
              ok: false,
              error: "Invalid ChangeReviewReport from /api/review",
            };
          }
          return { ok: true, data: parsed.data as T };
        }

        case "explainArea":
        case "listBookmarks":
        case "saveBookmark":
        case "removeBookmark":
        case "listPackages":
        case "selectPackage":
          return {
            ok: false,
            error: `HTTP transport does not implement "${method}"`,
          };

        default:
          return { ok: false, error: `Unknown method "${method}"` };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    get targetLabel(): string {
      return root() ?? ".";
    },
    command(method: string, detail?: string): string {
      const r = root() ?? ".";
      const base = detail ? `${method} ${detail}` : method;
      return `http:${base} root=${r}`;
    },
    invoke,
  };
}

/** Playground-only helpers that are not part of {@link createPrismClient}. */
export async function httpFetchPresets(
  fetchImpl: typeof fetch = fetch,
): Promise<{
  defaultRoot: string;
  presets: { id: string; label: string; root: string }[];
} | null> {
  try {
    const res = await fetchImpl("/api/presets");
    if (!res.ok) return null;
    return (await res.json()) as {
      defaultRoot: string;
      presets: { id: string; label: string; root: string }[];
    };
  } catch {
    return null;
  }
}

export async function httpFetchHealth(
  getRoot: () => string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<HealthScore | null> {
  try {
    const params = new URLSearchParams();
    const r = getRoot();
    if (r) params.set("root", r);
    const res = await fetchImpl(`/api/health?${params}`);
    if (!res.ok) return null;
    const parsed = HealthScoreSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function httpFetchDna(
  getRoot: () => string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<DnaReport | null> {
  try {
    const params = new URLSearchParams();
    const r = getRoot();
    if (r) params.set("root", r);
    const res = await fetchImpl(`/api/dna?${params}`);
    if (!res.ok) return null;
    const parsed = DnaReportSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
