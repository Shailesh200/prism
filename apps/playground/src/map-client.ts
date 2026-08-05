import type {
  BlastRadiusReport,
  CodeExplorerReport,
  CodeExplorerTarget,
  ConsentPurposeId,
  ConsentState,
  DnaReport,
  EngineeringHealthReport,
  GitActivity,
  GraphSnapshotDto,
  HealthHistoryBackfillStatus,
  HealthHistoryReport,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RegionMoversReport,
  RenameImpactReport,
  RepositoryMap,
  SafeDeleteReport,
  TestImpactReport,
  UtilityOverlayReport,
  BackendReport,
  BundleAnalyzeCapability,
  BundleWeightReport,
  SecurityReport,
  TestingReport,
  CwvReport,
} from "@prism/shared";
import {
  BlastRadiusReportSchema,
  BundleAnalyzeCapabilitySchema,
  BundleWeightReportSchema,
  CodeExplorerReportSchema,
  CwvReportSchema,
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
} from "@prism/shared";
import {
  withAudit,
  recordAudit,
  lighthouseProgressFromJobEvent,
  type AuditDiagnostic,
  type LighthouseLabProgressEvent,
} from "@prism/app-shell";
import type {
  ApplyRenameInput,
  ApplyRenameResult,
  TestListResult,
} from "@prism/app-shell";

type FixtureMaps = Partial<Record<MapZoomLevel, RepositoryMap>>;

export type PlaygroundPreset = {
  id: string;
  label: string;
  root: string;
};

export type PlaygroundPresets = {
  defaultRoot: string;
  presets: PlaygroundPreset[];
};

async function fromApi(
  zoom: MapZoomLevel,
  root: string | null,
  layers?: readonly MapLayerId[] | null,
): Promise<RepositoryMap | null> {
  try {
    const params = new URLSearchParams({ zoom });
    if (root) params.set("root", root);
    if (layers && layers.length > 0) params.set("layers", layers.join(","));
    const res = await fetch(`/api/map?${params}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      console.warn("map API error", body?.error ?? res.status);
      return null;
    }
    const json: unknown = await res.json();
    const parsed = RepositoryMapSchema.safeParse(json);
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
    const res = await fetch("/fixture-maps.json");
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

export async function fetchPresets(): Promise<PlaygroundPresets | null> {
  try {
    const res = await fetch("/api/presets");
    if (!res.ok) return null;
    return (await res.json()) as PlaygroundPresets;
  } catch {
    return null;
  }
}

/** Opt-in Remote Git: `git fetch --prune` (never push). */
export async function gitFetch(
  root: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = root ?? ".";
  try {
    const res = await fetch("/api/git-fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: target }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
    };
    if (data.ok === true) return { ok: true };
    return { ok: false, error: data.error ?? "git fetch failed" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Local git activity for the dashboard (recent files/commits + last synced). */
export async function fetchGitActivity(
  root: string | null,
): Promise<GitActivity | null> {
  const target = root ?? ".";
  const command = `GET /api/git?root=${encodeURIComponent(target)}`;
  return withAudit(
    {
      category: "git",
      operation: "Loaded git activity",
      target,
      command,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/git?${params}`);
        if (!res.ok) return null;
        const parsed = GitActivitySchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
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
      const commits = data.recentCommits.length;
      const files = data.recentFiles.length;
      const days = data.days.length;
      return {
        status: "success",
        output: [
          `branch=${data.summary?.branch ?? "unknown"}`,
          `recentCommits=${commits}`,
          `recentFiles=${files}`,
          `dayBuckets=${days}`,
        ].join("\n"),
      };
    },
  );
}

/** Repository health score + factors (Core `getHealth`). */
export async function fetchHealth(
  root: string | null,
): Promise<HealthScore | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Computed health score",
      target,
      command: `GET /api/health?root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/health?${params}`);
        if (!res.ok) return null;
        const parsed = HealthScoreSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "Health score unavailable." };
      }
      const diagnostics: AuditDiagnostic[] = data.factors
        .filter((f) => f.note || f.score < 60)
        .map((f) => ({
          severity: (f.score < 40
            ? "error"
            : f.score < 60
              ? "warning"
              : "info") as "error" | "warning" | "info",
          message: `${f.label}: ${Math.round(f.score)}`,
          ...(f.note ? { fix: f.note } : {}),
        }));
      const lines = [
        `score=${Math.round(data.score)} grade=${data.grade}`,
        ...data.factors.map(
          (f) =>
            `  ${f.id}=${Math.round(f.score)}${f.note ? ` — ${f.note}` : ""}`,
        ),
      ];
      return {
        status: data.score < 40 ? "warning" : "success",
        output: lines.join("\n"),
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  );
}

/** Codebase DNA — languages, frameworks, stack domains & personas (Core `getDna`). */
export async function fetchDna(root: string | null): Promise<DnaReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Computed codebase DNA",
      target,
      command: `GET /api/dna?root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/dna?${params}`);
        if (!res.ok) return null;
        const parsed = DnaReportSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "DNA report unavailable." };
      }
      const langs = data.languages.length;
      const frameworks = data.frameworks.length;
      const packages = data.stack?.packages?.length ?? 0;
      return {
        status: "success",
        output: [
          `languages=${langs}`,
          `frameworks=${frameworks}`,
          `packages=${packages}`,
          data.summary,
        ].join("\n"),
      };
    },
  );
}

export async function fetchHealthHistory(
  root: string | null,
): Promise<HealthHistoryReport> {
  const params = new URLSearchParams();
  if (root) params.set("root", root);
  const res = await fetch(`/api/health-history?${params}`);
  if (!res.ok) throw new Error(`health-history failed: ${res.status}`);
  const parsed = HealthHistoryReportSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("Invalid health history payload");
  return parsed.data;
}

export async function fetchRegionMovers(
  root: string | null,
): Promise<RegionMoversReport> {
  const params = new URLSearchParams();
  if (root) params.set("root", root);
  const res = await fetch(`/api/region-movers?${params}`);
  if (!res.ok) throw new Error(`region-movers failed: ${res.status}`);
  const parsed = RegionMoversReportSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("Invalid region movers payload");
  return parsed.data;
}

export async function startHealthHistoryBackfill(
  root: string | null,
): Promise<void> {
  const params = new URLSearchParams();
  if (root) params.set("root", root);
  const res = await fetch(`/api/health-history/backfill?${params}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`health-history backfill failed: ${res.status}`);
}

export async function fetchHealthHistoryBackfillStatus(
  root: string | null,
): Promise<HealthHistoryBackfillStatus> {
  const params = new URLSearchParams();
  if (root) params.set("root", root);
  const res = await fetch(`/api/health-history/backfill?${params}`);
  if (!res.ok) {
    throw new Error(`health-history backfill status failed: ${res.status}`);
  }
  const parsed = HealthHistoryBackfillStatusSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("Invalid backfill status payload");
  return parsed.data;
}

/** Discover frontend URL paths for Routes & components. */
export async function discoverFrontendRoutes(
  root: string | null,
): Promise<string[]> {
  const params = new URLSearchParams();
  if (root) params.set("root", root);
  const res = await fetch(`/api/frontend-routes?${params}`);
  if (!res.ok) throw new Error(`frontend-routes failed: ${res.status}`);
  const body = (await res.json()) as { routes?: string[]; error?: string };
  if (body.error) throw new Error(body.error);
  return Array.isArray(body.routes) ? body.routes : ["/"];
}

/** Opt-in local Lighthouse / CWV lab (Core startUtilityJob + getCwvReport). */
export async function runLighthouseLab(
  root: string | null,
  options?: {
    mode?: "lab-fixture" | "run" | "ingest";
    url?: string;
    port?: number;
    routes?: readonly string[];
    onProgress?: (event: LighthouseLabProgressEvent) => void;
  },
): Promise<CwvReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "integration",
      operation: "Lighthouse CWV lab",
      target,
      command: `GET /api/lighthouse?root=${encodeURIComponent(target)}`,
    },
    async () => {
      const params = new URLSearchParams();
      if (root) params.set("root", root);
      params.set("mode", options?.mode ?? "lab-fixture");
      if (options?.url) params.set("url", options.url);
      if (options?.port !== undefined) {
        params.set("port", String(options.port));
      }
      if (options?.routes && options.routes.length > 0) {
        params.set("routes", options.routes.join(","));
      }
      if (options?.mode === "run" || options?.onProgress) {
        params.set("stream", "1");
      }
      const res = await fetch(`/api/lighthouse?${params}`);
      if (!res.ok) {
        let detail = `Lighthouse lab failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let report: CwvReport | null = null;
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
              detail?: import("@prism/shared").JsonValue;
              report?: CwvReport;
              error?: string;
            };
            try {
              evt = JSON.parse(trimmed) as typeof evt;
            } catch {
              continue;
            }
            if (evt.type === "progress" && (evt.message || evt.detail)) {
              options?.onProgress?.(
                lighthouseProgressFromJobEvent({
                  message: evt.message ?? "",
                  ...(evt.detail !== undefined ? { detail: evt.detail } : {}),
                }),
              );
            } else if (evt.type === "report" && evt.report) {
              report = evt.report;
            } else if (evt.type === "error") {
              throw new Error(evt.error ?? "Lighthouse lab failed");
            }
          }
        }
        if (!report)
          throw new Error("Lighthouse stream ended without a report");
        const parsed = CwvReportSchema.safeParse(report);
        if (!parsed.success) {
          throw new Error("Invalid CWV report payload from Lighthouse lab");
        }
        return parsed.data;
      }
      const parsed = CwvReportSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw new Error("Invalid CWV report payload from Lighthouse lab");
      }
      return parsed.data;
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "Lighthouse lab failed." };
      }
      return {
        status: "success",
        output: [
          `source=${data.source}`,
          `url=${data.url}`,
          `metrics=${data.metrics.length}`,
        ].join("\n"),
      };
    },
  );
}

export async function detectBundleAnalyzeCapability(
  root: string | null,
  options?: { packageId?: string },
): Promise<BundleAnalyzeCapability> {
  const params = new URLSearchParams();
  if (root) params.set("root", root);
  if (options?.packageId) params.set("packageId", options.packageId);
  const res = await fetch(`/api/detect-bundle-analyze?${params}`);
  if (!res.ok) throw new Error(`detect-bundle-analyze failed: ${res.status}`);
  const parsed = BundleAnalyzeCapabilitySchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error("Invalid BundleAnalyzeCapability payload");
  }
  return parsed.data;
}

export async function runBundleAnalyze(
  root: string | null,
  options?: {
    mode?: "run" | "ingest" | "discover";
    packageId?: string;
    packagePath?: string;
    scriptName?: string;
    reportPath?: string;
    onProgress?: (event: { message: string }) => void;
  },
): Promise<BundleWeightReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "integration",
      operation: "Bundle Weight analyze",
      target,
      command: `GET /api/bundle-analyze?root=${encodeURIComponent(target)}`,
    },
    async () => {
      const params = new URLSearchParams();
      if (root) params.set("root", root);
      params.set("mode", options?.mode ?? "run");
      if (options?.packageId) params.set("packageId", options.packageId);
      if (options?.packagePath) params.set("packagePath", options.packagePath);
      if (options?.scriptName) params.set("scriptName", options.scriptName);
      if (options?.reportPath) params.set("reportPath", options.reportPath);
      params.set("stream", "1");
      const res = await fetch(`/api/bundle-analyze?${params}`);
      if (!res.ok) {
        let detail = `Bundle analyze failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let report: BundleWeightReport | null = null;
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
              report?: BundleWeightReport;
              error?: string;
            };
            try {
              evt = JSON.parse(trimmed) as typeof evt;
            } catch {
              continue;
            }
            if (evt.type === "progress" && evt.message) {
              options?.onProgress?.({ message: evt.message });
            } else if (evt.type === "report" && evt.report) {
              report = evt.report;
            } else if (evt.type === "error") {
              throw new Error(evt.error ?? "Bundle analyze failed");
            }
          }
        }
        if (!report) throw new Error("Bundle stream ended without a report");
        const parsed = BundleWeightReportSchema.safeParse(report);
        if (!parsed.success) {
          throw new Error("Invalid BundleWeightReport payload");
        }
        return parsed.data;
      }
      const parsed = BundleWeightReportSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw new Error("Invalid BundleWeightReport payload");
      }
      return parsed.data;
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

/** Every consent purpose with the decision so far, read from Core. */
export async function fetchConsent(
  root: string | null,
): Promise<readonly ConsentState[]> {
  const res = await fetch(
    `/api/consent?root=${encodeURIComponent(root ?? ".")}`,
  );
  if (!res.ok) throw new Error(`consent failed: ${res.status}`);
  return (await res.json()) as readonly ConsentState[];
}

/** Record one decision and return the refreshed set. */
export async function setConsent(
  root: string | null,
  purpose: ConsentPurposeId,
  granted: boolean,
): Promise<readonly ConsentState[]> {
  const res = await fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root: root ?? ".", purpose, granted }),
  });
  if (!res.ok) throw new Error(`consent failed: ${res.status}`);
  return (await res.json()) as readonly ConsentState[];
}

/** Stage foreign-repo DevOps files under `.prism/remote-ci/<owner>/<repo>/`. */
export async function stageDevopsRemote(
  root: string | null,
  input: {
    owner: string;
    repo: string;
    token?: string;
  },
): Promise<import("@prism/app-shell").StageDevopsRemoteResult> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "integration",
      operation: "Stage remote DevOps CI",
      target,
      command: `POST /api/stage-devops-remote ${input.owner}/${input.repo}`,
    },
    async () => {
      const res = await fetch("/api/stage-devops-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: target,
          owner: input.owner,
          repo: input.repo,
          ...(input.token ? { token: input.token } : {}),
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
        throw new Error(err);
      }
      return json as import("@prism/app-shell").StageDevopsRemoteResult;
    },
    (data) => ({
      status: "success",
      output: `staged=${data.paths.length} workflows=${data.workflows.length}`,
    }),
  );
}

/** Domain utility overlay (Core `getUtilityOverlay`); opt-in, runs on demand. */
export async function fetchOverlay(
  kind: string,
  root: string | null,
): Promise<UtilityOverlayReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "integration",
      operation: `Utility overlay: ${kind}`,
      target,
      command: `GET /api/overlay?kind=${encodeURIComponent(kind)}&root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        params.set("kind", kind);
        if (root) params.set("root", root);
        const res = await fetch(`/api/overlay?${params}`);
        if (!res.ok) return null;
        const parsed = UtilityOverlayReportSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    (data) => {
      if (!data) {
        return { status: "error", output: `Overlay "${kind}" failed.` };
      }
      const findings = data.findings?.length ?? 0;
      const nodes = data.graph?.nodes?.length ?? 0;
      return {
        status: findings > 0 ? "warning" : "success",
        output: [
          `kind=${data.kind}`,
          `domain=${data.domain}`,
          `findings=${findings}`,
          `graphNodes=${nodes}`,
          data.summary,
        ].join("\n"),
      };
    },
  );
}

/** Route-granular backend report (Core `getBackendReport`, M-044). */
export async function fetchBackendReport(
  root: string | null,
): Promise<BackendReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Computed backend report",
      target,
      command: `GET /api/backend?root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/backend?${params}`);
        if (!res.ok) return null;
        const parsed = BackendReportSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "Backend report unavailable." };
      }
      return {
        status: "success",
        output: [
          `endpoints=${data.endpoints.length}`,
          `frameworks=${data.frameworksDetected.join(",") || "none"}`,
          data.summary,
        ].join("\n"),
      };
    },
  );
}

/** Testing structure + coverage (Core `getTestingReport`, M-046). */
export async function fetchTestingReport(
  root: string | null,
): Promise<TestingReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Computed testing report",
      target,
      command: `GET /api/testing?root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/testing?${params}`);
        if (!res.ok) return null;
        const parsed = TestingReportSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
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
}

/** Security tooling + checklist (Core `getSecurityReport`, M-046). */
export async function fetchSecurityReport(
  root: string | null,
): Promise<SecurityReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Computed security report",
      target,
      command: `GET /api/security?root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/security?${params}`);
        if (!res.ok) return null;
        const parsed = SecurityReportSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
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
}

/** Engineering health (Core `getEngineeringHealth`, M-022 / M-046). */
export async function fetchEngineeringHealth(
  root: string | null,
): Promise<EngineeringHealthReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Computed engineering health",
      target,
      command: `GET /api/engineering-health?root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/engineering-health?${params}`);
        if (!res.ok) return null;
        const parsed = EngineeringHealthReportSchema.safeParse(
          await res.json(),
        );
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    (data) => {
      if (!data) {
        return { status: "error", output: "Engineering health unavailable." };
      }
      return {
        status: "success",
        output: `metrics=${data.metrics.length} git=${data.gitAvailable}`,
      };
    },
  );
}

/** Code explorer (Core `exploreCode`, M-023 / M-046). */
export async function fetchCodeExplorer(
  root: string | null,
  target: CodeExplorerTarget,
): Promise<CodeExplorerReport | null> {
  const workspace = root ?? ".";
  const label =
    target.kind === "file"
      ? target.path
      : `${target.name}${target.path ? `@${target.path}` : ""}`;
  return withAudit(
    {
      category: "analysis",
      operation: "Explored code selection",
      target: workspace,
      command: `GET /api/code-explorer?kind=${target.kind}&q=${encodeURIComponent(label)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        params.set("kind", target.kind);
        if (target.kind === "file") {
          params.set("path", target.path);
        } else {
          params.set("name", target.name);
          if (target.path) params.set("path", target.path);
        }
        const res = await fetch(`/api/code-explorer?${params}`);
        if (!res.ok) return null;
        const json: unknown = await res.json();
        if (json === null) return null;
        const parsed = CodeExplorerReportSchema.safeParse(json);
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
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

/** Re-read coverage artifacts (Core `ingestCoverageFromWorkspace`). */
export async function ingestCoverage(
  root: string | null,
): Promise<TestingReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Ingested coverage artifacts",
      target,
      command: `GET /api/ingest-coverage?root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/ingest-coverage?${params}`);
        if (!res.ok) return null;
        const parsed = TestingReportSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
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
}

/**
 * Run workspace tests via the playground Vite API (same runners as extension).
 */
export async function runTests(
  root: string | null,
  options?: {
    coverage?: boolean;
    path?: string;
    testNamePattern?: string;
  },
): Promise<TestingReport | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "test",
      operation: "Run workspace tests",
      target,
      command: `POST /api/run-tests root=${encodeURIComponent(target)}`,
    },
    async () => {
      const res = await fetch("/api/run-tests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root: target,
          ...(options?.coverage === true ? { coverage: true } : {}),
          ...(options?.path ? { path: options.path } : {}),
          ...(options?.testNamePattern
            ? { testNamePattern: options.testNamePattern }
            : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`Run tests failed (${res.status})`);
      }
      const parsed = TestingReportSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw new Error("Invalid TestingReport from /api/run-tests");
      }
      return parsed.data;
    },
    (data) => ({
      status: "success",
      output: `results=${data?.results?.length ?? 0}`,
    }),
  );
}

/**
 * Discover tests via vitest/jest list through the playground Vite API.
 */
export async function listTests(
  root: string | null,
): Promise<TestListResult | null> {
  try {
    const params = new URLSearchParams();
    if (root) params.set("root", root);
    const res = await fetch(`/api/list-tests?${params}`);
    if (!res.ok) return { files: [] };
    const data = (await res.json()) as TestListResult;
    return data?.files ? data : { files: [] };
  } catch {
    return { files: [] };
  }
}

/** File dependency graph (Core `getDependencyGraph`) for centrality summaries. */
export async function fetchDependencyGraph(
  root: string | null,
): Promise<GraphSnapshotDto | null> {
  const target = root ?? ".";
  return withAudit(
    {
      category: "analysis",
      operation: "Loaded dependency graph",
      target,
      command: `GET /api/graph?root=${encodeURIComponent(target)}`,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        if (root) params.set("root", root);
        const res = await fetch(`/api/graph?${params}`);
        if (!res.ok) return null;
        const parsed = GraphSnapshotDtoSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
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
  intent?: "edit" | "delete";
};

/** Combined M-020/M-021 impact reports for a change target. */
export async function fetchImpactBundle(
  target: ImpactTarget,
  root: string | null,
): Promise<{ ok: true; value: ImpactBundle } | { ok: false; error: string }> {
  const label = target.path ?? target.id;
  const rootLabel = root ?? ".";
  const command = `GET /api/impact?kind=${target.kind}&id=${encodeURIComponent(target.id)}`;
  return withAudit(
    {
      category: "impact",
      operation: `Blast radius: ${label}`,
      target: label,
      command,
    },
    async () => {
      try {
        const params = new URLSearchParams();
        params.set("kind", target.kind);
        params.set("id", target.id);
        if (root) params.set("root", root);
        if (target.path) params.set("path", target.path);
        if (target.newName) params.set("newName", target.newName);
        if (target.intent) params.set("intent", target.intent);
        const res = await fetch(`/api/impact?${params}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          return {
            ok: false as const,
            error: body?.error ?? `HTTP ${res.status}`,
          };
        }
        const json: unknown = await res.json();
        if (typeof json !== "object" || json === null) {
          return { ok: false as const, error: "Invalid impact payload" };
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
          return { ok: false as const, error: "Impact schema mismatch" };
        }
        return {
          ok: true as const,
          value: {
            blast: blast.data,
            safeDelete: safeDelete.data,
            rename: rename.data,
            testImpact: testImpact.data,
          },
        };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    (result) => {
      if (!result.ok) {
        return {
          status: "error",
          output: result.error,
          diagnostics: [{ severity: "error", message: result.error }],
        };
      }
      const { blast } = result.value;
      const affected = blast.affectedFiles.length;
      const tests = blast.testsLikelyAffected.length;
      const status =
        blast.risk >= 70 ? "warning" : blast.risk >= 40 ? "warning" : "success";
      return {
        status,
        output: [
          `root=${rootLabel}`,
          `risk=${Math.round(blast.risk)}`,
          `affectedFiles=${affected}`,
          `testsLikelyAffected=${tests}`,
          blast.truncated ? "truncated=true" : "truncated=false",
        ].join("\n"),
      };
    },
  );
}

export type SymbolSearchHit = {
  id: string;
  name: string;
  kind: string;
  path: string;
  exported: boolean;
};

/** Apply a file rename via the playground Vite middleware (Node fs). */
export async function applyRename(
  input: ApplyRenameInput,
  root: string | null,
): Promise<ApplyRenameResult> {
  try {
    const res = await fetch("/api/apply-rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(root ? { root } : {}),
        input,
      }),
    });
    const json = (await res.json()) as ApplyRenameResult | { error?: string };
    if (!res.ok) {
      return {
        ok: false,
        error:
          "error" in json && typeof json.error === "string"
            ? json.error
            : `HTTP ${res.status}`,
      };
    }
    if (
      json &&
      typeof json === "object" &&
      "ok" in json &&
      typeof json.ok === "boolean"
    ) {
      return json as ApplyRenameResult;
    }
    return { ok: false, error: "Invalid apply-rename response" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Symbol name search (Core `findSymbol`) for blast target picker. */
export async function fetchSymbolHits(
  query: string,
  root: string | null,
): Promise<SymbolSearchHit[]> {
  try {
    const q = query.trim();
    if (q.length < 1) return [];
    const params = new URLSearchParams({ q });
    if (root) params.set("root", root);
    const res = await fetch(`/api/symbols?${params}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { hits?: SymbolSearchHit[] };
    return Array.isArray(json.hits) ? json.hits : [];
  } catch {
    return [];
  }
}

/** Load map from Vite Core middleware (dev) or static fixture bundle (build). */
export async function fetchRepositoryMap(
  zoom: MapZoomLevel,
  root: string | null = null,
  layers?: readonly MapLayerId[] | null,
): Promise<RepositoryMap> {
  const target = root ?? "fixture";
  const layerList = layers?.length ? layers.join(",") : "default";
  return withAudit(
    {
      category: "index",
      operation: "Indexed repository",
      target,
      command: `GET /api/map?zoom=${zoom}&root=${encodeURIComponent(target)}&layers=${layerList}`,
    },
    async () => {
      const live = await fromApi(zoom, root, layers);
      if (live) return live;
      if (!root) {
        const staticMap = await fromStatic(zoom);
        if (staticMap) {
          recordCacheHit(zoom);
          return staticMap;
        }
      }
      throw new Error(
        root
          ? `Could not index repository at "${root}". Check the path and playground logs.`
          : `No repository map for zoom "${zoom}". Start with bun --filter @prism/playground dev`,
      );
    },
    (map) => ({
      status: "success",
      output: [
        `zoom=${map.zoom ?? zoom}`,
        `nodes=${map.graph.nodes.length}`,
        `edges=${map.graph.edges.length}`,
        `generatedAt=${map.generatedAt}`,
      ].join("\n"),
    }),
  );
}

function recordCacheHit(zoom: MapZoomLevel): void {
  recordAudit({
    category: "cache",
    operation: "Cache hit: fixture map snapshot",
    target: `zoom=${zoom}`,
    durationMs: 0,
    status: "success",
    command: "GET /fixture-maps.json",
    output: `Served static fixture map for zoom "${zoom}".`,
  });
}
