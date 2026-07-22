import type {
  BlastRadiusReport,
  DnaReport,
  GitActivity,
  GraphSnapshotDto,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RenameImpactReport,
  RepositoryMap,
  SafeDeleteReport,
  TestImpactReport,
  UtilityOverlayReport,
  BackendReport,
} from "@prism/shared";
import {
  BlastRadiusReportSchema,
  DnaReportSchema,
  GitActivitySchema,
  GraphSnapshotDtoSchema,
  HealthScoreSchema,
  RenameImpactReportSchema,
  RepositoryMapSchema,
  SafeDeleteReportSchema,
  TestImpactReportSchema,
  UtilityOverlayReportSchema,
  BackendReportSchema,
} from "@prism/shared";
import { withAudit, recordAudit, type AuditDiagnostic } from "./audit-log.js";

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
