/**
 * Domain-report derivations (M-053).
 *
 * These used to live as private useMemos / helpers in DomainScreen.tsx.
 * They live in `@repo-prism/shared` so Core and the webview compute identical
 * numbers (same pattern as overview-model.ts). Behaviour is pinned by
 * characterisation tests — do not “fix” outputs here.
 */

import type {
  BackendCoverage,
  BackendDataLayerCounts,
  BackendEndpoint,
  BackendReport,
  CwvMetric,
  CwvPreferredSource,
  CwvReport,
  DesktopIpcChannel,
  DesktopTiles,
  DevopsTiles,
  DnaReport,
  DomainChurnRow,
  DomainKindCount,
  DomainOverlayLink,
  DomainRankedNode,
  DomainStackSnapshot,
  FrontendComponentBreakdownRow,
  FrontendRouteBreakdownRow,
  GitActivity,
  GraphNodeDto,
  GraphSnapshotDto,
  MobileScreenCoverage,
  MobileTiles,
  UtilityOverlayFinding,
  UtilityOverlayReport,
} from "./schemas.js";

/* -------------------------------------------------------------------------
 * Dependency-graph inbound helpers (ex-domain-aggregations.ts)
 * ---------------------------------------------------------------------- */

export function normalizeDepKey(idOrPath: string): string {
  let p = idOrPath.trim().replace(/\\/g, "/");
  if (p.startsWith("file:")) p = p.slice("file:".length);
  p = p.replace(/^\.\//, "");
  return p;
}

export function inboundDepCounts(
  depGraph: GraphSnapshotDto | null | undefined,
): Map<string, number> {
  const inDeg = new Map<string, number>();
  if (!depGraph) return inDeg;
  for (const e of depGraph.edges) {
    if (!e.to) continue;
    const key = normalizeDepKey(e.to);
    inDeg.set(key, (inDeg.get(key) ?? 0) + 1);
  }
  return inDeg;
}

export function lookupInbound(
  inDeg: Map<string, number>,
  path: string,
): number {
  const key = normalizeDepKey(path);
  if (!key) return 0;
  return inDeg.get(key) ?? 0;
}

export function fileStem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base
    .replace(/\.(test|spec)\.[cm]?[jt]sx?$/i, "")
    .replace(/\.[cm]?[jt]sx?$/i, "")
    .replace(/\.(go|py|rb|java|rs)$/i, "")
    .toLowerCase();
}

export function overlayNodePath(
  attrs: GraphNodeDto["attrs"] | Record<string, unknown> | undefined,
): string {
  return typeof attrs?.path === "string" ? attrs.path : "";
}

export function countOverlayKinds(
  nodes: readonly GraphNodeDto[],
): DomainKindCount[] {
  const map = new Map<string, number>();
  for (const n of nodes) map.set(n.kind, (map.get(n.kind) ?? 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ kind, count }));
}

export function kindCountOf(
  nodes: readonly GraphNodeDto[],
  kind: string,
): number {
  return nodes.reduce((acc, n) => acc + (n.kind === kind ? 1 : 0), 0);
}

/* -------------------------------------------------------------------------
 * Shared rankings
 * ---------------------------------------------------------------------- */

export function rankMostDepended(
  nodes: readonly GraphNodeDto[],
  depGraph: GraphSnapshotDto | null | undefined,
  limit = 8,
): DomainRankedNode[] {
  const inDeg = inboundDepCounts(depGraph);
  return nodes
    .map((n) => {
      const path = overlayNodePath(n.attrs);
      return {
        id: n.id,
        label: n.label,
        path,
        kind: n.kind,
        deps: lookupInbound(inDeg, path),
      };
    })
    .filter((x) => x.deps > 0)
    .sort((a, b) => b.deps - a.deps)
    .slice(0, limit);
}

export function rankChurnHotspots(
  nodes: readonly GraphNodeDto[],
  gitActivity: GitActivity | null | undefined,
  limit = 8,
): DomainChurnRow[] {
  if (!gitActivity) return [];
  const byPath = new Map(
    gitActivity.recentFiles.map((f) => [f.path, f] as const),
  );
  return nodes
    .map((n) => {
      const path = overlayNodePath(n.attrs);
      const file = byPath.get(path);
      if (!file) return null;
      return {
        id: n.id,
        label: n.label,
        path,
        kind: n.kind,
        commits: file.commits,
        additions: file.additions,
        deletions: file.deletions,
      };
    })
    .filter((x): x is DomainChurnRow => x !== null)
    .sort((a, b) => b.commits - a.commits)
    .slice(0, limit);
}

type StackDomain = "mobile" | "desktop" | "data_ml_ai";

const STACK_FILTERS: Record<
  StackDomain,
  {
    domainId: string;
    signalRe: RegExp;
    frameworkRe: RegExp;
  }
> = {
  mobile: {
    domainId: "mobile",
    signalRe: /^(mobile-|expo|react-native|flutter)/i,
    frameworkRe: /expo|react-native|flutter|native/i,
  },
  desktop: {
    domainId: "desktop",
    signalRe: /^(desktop-|electron|tauri)/i,
    frameworkRe: /electron|tauri/i,
  },
  data_ml_ai: {
    domainId: "data_ml_ai",
    signalRe: /^(data-|ml-|ai-|notebook|spark|dbt|pipeline)/i,
    frameworkRe: /spark|dbt|pytorch|tensorflow|keras|sklearn|jupyter|airflow/i,
  },
};

export function buildDomainStackSnapshot(
  dna: DnaReport | null | undefined,
  domain: StackDomain,
): DomainStackSnapshot | null {
  if (!dna) return null;
  const filter = STACK_FILTERS[domain];
  const signals = (dna.stack?.signals ?? [])
    .filter((s) => s.domain === filter.domainId || filter.signalRe.test(s.id))
    .sort((a, b) => b.confidence - a.confidence);
  const frameworks = (dna.frameworks ?? []).filter((f) =>
    filter.frameworkRe.test(f),
  );
  const unique = new Map<string, (typeof signals)[number]>();
  for (const s of signals) {
    if (!unique.has(s.id)) unique.set(s.id, s);
  }
  return {
    frameworks,
    signals: [...unique.values()].slice(0, 8),
    detected: dna.stack?.domains?.includes(filter.domainId) ?? false,
  };
}

export function buildOverlayLinks(
  overlay: UtilityOverlayReport | null | undefined,
  options?: { edgeKind?: string },
): DomainOverlayLink[] {
  if (!overlay) return [];
  const nodes = overlay.graph.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (overlay.graph.edges ?? [])
    .filter((e) =>
      options?.edgeKind === undefined ? true : e.kind === options.edgeKind,
    )
    .map((e) => {
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      return {
        id: e.id,
        kind: e.kind,
        fromLabel:
          from?.label.split("/").pop() ??
          String(from?.attrs?.path ?? e.from)
            .split("/")
            .pop() ??
          e.from,
        toLabel:
          to?.label.split("/").pop() ??
          String(to?.attrs?.path ?? e.to)
            .split("/")
            .pop() ??
          e.to,
        fromKind: from?.kind ?? "",
        toKind: to?.kind ?? "",
      };
    })
    .filter((l) => l.fromKind !== "" && l.toKind !== "");
}

/* -------------------------------------------------------------------------
 * Frontend (T-08)
 * ---------------------------------------------------------------------- */

/**
 * Merge discovered workspace routes with DNA heuristic routes.
 * Empty → `["/"]`. `/` sorts first (DomainScreen characterisation).
 */
export function mergeFrontendRoutes(
  ...sources: readonly (readonly string[])[]
): string[] {
  const merged = new Set<string>();
  for (const src of sources) {
    for (const route of src) merged.add(route);
  }
  if (merged.size === 0) merged.add("/");
  return [...merged].sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
}

/** Prefer local or PageSpeed CWV, with the other as fallback. */
export function selectPrimaryCwv(
  preferredSource: CwvPreferredSource,
  local: CwvReport | null | undefined,
  pagespeed: CwvReport | null | undefined,
): CwvReport | null {
  if (preferredSource === "pagespeed") {
    return pagespeed ?? local ?? null;
  }
  return local ?? pagespeed ?? null;
}

/**
 * Route breakdown: measured lab URL + DNA / discovered routes.
 * Pin: DomainScreen.tsx routeBreakdown useMemo (pre-M-053).
 */
export function buildFrontendRouteBreakdown(
  frontendRoutes: readonly string[],
  report: CwvReport | null | undefined,
): FrontendRouteBreakdownRow[] {
  const measuredRoute = (() => {
    if (!report?.url) return null;
    try {
      const u = new URL(report.url);
      const path = u.pathname || "/";
      return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    } catch {
      return "/";
    }
  })();
  const worstRating = (metrics: readonly CwvMetric[]): CwvMetric["rating"] => {
    if (metrics.some((m) => m.rating === "poor")) return "poor";
    if (metrics.some((m) => m.rating === "needs-improvement"))
      return "needs-improvement";
    if (metrics.some((m) => m.rating === "good")) return "good";
    return "unknown";
  };
  // Equality on normalised paths only — substring matching let `/a` inherit
  // `/admin` metrics and `reportUrl.endsWith("/")` let `/` absorb every route.
  const normalizeRoutePath = (route: string): string => {
    const trimmed = route.trim();
    return trimmed.length > 1 && trimmed.endsWith("/")
      ? trimmed.slice(0, -1)
      : trimmed;
  };
  const routeMatches = (route: string): boolean =>
    measuredRoute !== null && normalizeRoutePath(route) === measuredRoute;
  const routes = new Set<string>(frontendRoutes);
  if (measuredRoute) routes.add(measuredRoute);
  for (const r of report?.rollups ?? []) {
    if (r.level === "route") routes.add(r.key);
  }
  return [...routes]
    .sort((a, b) => {
      if (a === "/") return -1;
      if (b === "/") return 1;
      return a.localeCompare(b);
    })
    .map((route) => {
      const rollup = report?.rollups?.find(
        (r) => r.level === "route" && r.key === route,
      );
      const matched = routeMatches(route);
      const metrics = [
        ...(rollup?.metrics ?? (matched ? (report?.metrics ?? []) : [])),
      ];
      const rating = metrics.length > 0 ? worstRating(metrics) : "unknown";
      const notes = (report?.attributions ?? [])
        .filter((a) => a.route === route && a.note)
        .map((a) => a.note!)
        .slice(0, 4);
      return {
        route,
        measured: Boolean(matched || rollup),
        linked: Boolean(rollup) || matched,
        sampleCount: rollup?.sampleCount ?? (matched ? 1 : 0),
        metricCount: metrics.length,
        metrics,
        rating,
        notes,
      };
    });
}

/**
 * Component breakdown from rollups + attributions (never fabricated).
 * Pin: DomainScreen.tsx componentBreakdown useMemo (pre-M-053).
 */
export function buildFrontendComponentBreakdown(
  report: CwvReport | null | undefined,
): FrontendComponentBreakdownRow[] {
  const rows = new Map<string, FrontendComponentBreakdownRow>();
  for (const r of report?.rollups ?? []) {
    if (r.level !== "component") continue;
    const rating = r.metrics.some((m) => m.rating === "poor")
      ? "poor"
      : r.metrics.some((m) => m.rating === "needs-improvement")
        ? "needs-improvement"
        : r.metrics.some((m) => m.rating === "good")
          ? "good"
          : "unknown";
    rows.set(r.key, {
      key: r.key,
      sampleCount: r.sampleCount,
      rating,
      metrics: [...r.metrics],
    });
  }
  for (const a of report?.attributions ?? []) {
    if (!a.component || rows.has(a.component)) continue;
    rows.set(a.component, {
      key: a.component,
      sampleCount: 0,
      rating: "unknown",
      metrics: [],
    });
  }
  return [...rows.values()].slice(0, 10);
}

/** Short summary line for FrontendDomainReport.summary. */
export function summarizeFrontendDomainReport(input: {
  readonly routes: readonly string[];
  readonly routeBreakdown: readonly FrontendRouteBreakdownRow[];
  readonly componentBreakdown: readonly FrontendComponentBreakdownRow[];
  readonly hasPrimaryCwv: boolean;
}): string {
  const measured = input.routeBreakdown.filter((r) => r.measured).length;
  if (!input.hasPrimaryCwv) {
    return `${input.routes.length} frontend routes discovered · no CWV report yet`;
  }
  // routeBreakdown is a superset of routes (adds measured + rollup routes), so
  // it is the only denominator that keeps measured ≤ total.
  return `${measured} of ${input.routeBreakdown.length} routes with CWV · ${input.componentBreakdown.length} components`;
}

/* -------------------------------------------------------------------------
 * Backend
 * ---------------------------------------------------------------------- */

/** Code handlers (exclude pure spec nodes) with a resolvable file path. */
export function backendHandlerNodes(
  nodes: readonly GraphNodeDto[],
): GraphNodeDto[] {
  return nodes.filter(
    (n) =>
      overlayNodePath(n.attrs) !== "" &&
      n.kind !== "openapi" &&
      n.kind !== "grpc-proto",
  );
}

export function buildBackendCoverage(
  report: BackendReport | null | undefined,
): BackendCoverage {
  const endpoints = report?.endpoints ?? [];
  const untested = endpoints.filter((e) => !e.tested);
  return {
    total: endpoints.length,
    tested: endpoints.length - untested.length,
    untested,
  };
}

export function countDataLayerByKind(
  items: readonly { kind: string }[],
): BackendDataLayerCounts {
  const map = new Map<string, number>();
  for (const d of items) map.set(d.kind, (map.get(d.kind) ?? 0) + 1);
  return {
    model: map.get("model") ?? 0,
    migration: map.get("migration") ?? 0,
    sql: map.get("sql") ?? 0,
    client: map.get("client") ?? 0,
  };
}

export function summarizeBackendDomainReport(input: {
  readonly endpoints: readonly BackendEndpoint[];
  readonly frameworks: readonly string[];
  readonly untested: number;
}): string {
  return `${input.endpoints.length} endpoints · ${input.untested} untested · ${input.frameworks.length} frameworks`;
}

/* -------------------------------------------------------------------------
 * DevOps
 * ---------------------------------------------------------------------- */

const SEVERITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Overlay findings, or CI concurrency/permissions heuristics when empty. */
export function buildDevopsFindings(
  overlay: UtilityOverlayReport | null | undefined,
): UtilityOverlayFinding[] {
  const nodes = overlay?.graph.nodes ?? [];
  const base = [...(overlay?.findings ?? [])].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
  if (base.length > 0) return base;
  const heuristic: UtilityOverlayFinding[] = [];
  for (const n of nodes.filter((x) => x.kind === "ci")) {
    if (heuristic.length >= 3) break;
    if (n.attrs?.hasConcurrency === false) {
      heuristic.push({
        id: `ui:concurrency:${n.id}`,
        message: `Workflow "${n.label}" has no concurrency group — parallel runs may overlap`,
        path: overlayNodePath(n.attrs),
        severity: "low",
      });
    }
    if (n.attrs?.hasPermissions === false && heuristic.length < 3) {
      heuristic.push({
        id: `ui:permissions:${n.id}`,
        message: `Workflow "${n.label}" lacks top-level permissions — GITHUB_TOKEN may be overly broad`,
        path: overlayNodePath(n.attrs),
        severity: "medium",
      });
    }
  }
  return heuristic;
}

export function buildDevopsTiles(nodes: readonly GraphNodeDto[]): DevopsTiles {
  const ci = nodes.filter((n) => n.kind === "ci").length;
  // container / kubernetes render as their own tiles — counting them under IaC
  // as well double-counts those resources.
  const iac = nodes.filter(
    (n) => n.kind !== "ci" && n.kind !== "container" && n.kind !== "kubernetes",
  ).length;
  return {
    iacResources: iac,
    pipelines: ci,
    containers: kindCountOf(nodes, "container"),
    kubernetes: kindCountOf(nodes, "kubernetes"),
  };
}

export function summarizeDevopsDomainReport(tiles: DevopsTiles): string {
  return `${tiles.iacResources} IaC · ${tiles.pipelines} pipelines · ${tiles.containers} containers`;
}

/* -------------------------------------------------------------------------
 * Mobile
 * ---------------------------------------------------------------------- */

export function buildMobileScreenCoverage(
  screenNodes: readonly GraphNodeDto[],
  qa: UtilityOverlayReport | null | undefined,
): MobileScreenCoverage {
  const testStems = (qa?.graph.nodes ?? [])
    .map((n) => fileStem(overlayNodePath(n.attrs)))
    .filter(Boolean);
  const stemSet = new Set(testStems);
  const untested = screenNodes.filter((n) => {
    const s = fileStem(overlayNodePath(n.attrs));
    if (s === "") return true;
    return !(stemSet.has(s) || testStems.some((t) => t.includes(s)));
  });
  return {
    total: screenNodes.length,
    tested: screenNodes.length - untested.length,
    untestedIds: untested.map((n) => n.id),
  };
}

export function buildMobileTiles(
  nodes: readonly GraphNodeDto[],
  screenCoverage: MobileScreenCoverage,
): MobileTiles {
  const screenNodes = nodes.filter((n) => n.kind === "screen");
  const navigatorNodes = nodes.filter((n) => n.kind === "navigator");
  const expoScreens = screenNodes.filter((n) => n.attrs?.router === "expo");
  return {
    screens: screenNodes.length,
    navigators: navigatorNodes.length,
    expoRouter: expoScreens.length,
    untested: screenCoverage.untestedIds.length,
  };
}

export function buildMobileNavLinks(
  overlay: UtilityOverlayReport | null | undefined,
): DomainOverlayLink[] {
  return buildOverlayLinks(overlay, { edgeKind: "navigates" });
}

export function summarizeMobileDomainReport(tiles: MobileTiles): string {
  return `${tiles.screens} screens · ${tiles.navigators} navigators · ${tiles.untested} untested`;
}

/* -------------------------------------------------------------------------
 * Desktop
 * ---------------------------------------------------------------------- */

const DESKTOP_PROCESS_KINDS = new Set([
  "main",
  "preload",
  "renderer",
  "ipc",
  "tauri-config",
]);

export function desktopProcessNodes(
  nodes: readonly GraphNodeDto[],
): GraphNodeDto[] {
  return nodes.filter((n) => DESKTOP_PROCESS_KINDS.has(n.kind));
}

export function buildDesktopTiles(
  nodes: readonly GraphNodeDto[],
): DesktopTiles {
  return {
    main: kindCountOf(nodes, "main"),
    renderer: kindCountOf(nodes, "renderer"),
    ipc: kindCountOf(nodes, "ipc"),
    preload: kindCountOf(nodes, "preload"),
    tauriConfig: kindCountOf(nodes, "tauri-config"),
  };
}

export function buildDesktopBoundaryLinks(
  overlay: UtilityOverlayReport | null | undefined,
): DomainOverlayLink[] {
  return buildOverlayLinks(overlay);
}

export function buildDesktopIpcChannels(
  overlay: UtilityOverlayReport | null | undefined,
): DesktopIpcChannel[] {
  if (!overlay) return [];
  const nodes = overlay.graph.nodes ?? [];
  const rows: DesktopIpcChannel[] = [];
  for (const f of overlay.findings ?? []) {
    const m =
      /^IPC (ipcMain\.handle|ipcMain\.on|ipcRenderer\.invoke|ipcRenderer\.send|contextBridge): "([^"]+)"/.exec(
        f.message,
      );
    if (!m) continue;
    rows.push({
      name: m[2]!,
      source: m[1]!,
      path: f.path ?? "",
      risk: f.severity === "medium" ? "medium" : "low",
    });
  }
  if (rows.length === 0) {
    for (const n of nodes.filter((x) => x.kind === "ipc")) {
      const raw = String(n.attrs?.channels ?? "");
      for (const name of raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)) {
        rows.push({
          name,
          source: "ipc",
          path: overlayNodePath(n.attrs),
          risk: "low",
        });
      }
    }
  }
  return rows;
}

export function summarizeDesktopDomainReport(tiles: DesktopTiles): string {
  return `${tiles.main} main · ${tiles.renderer} renderer · ${tiles.ipc} IPC files`;
}

/* -------------------------------------------------------------------------
 * Data / ML
 * ---------------------------------------------------------------------- */

export function summarizeDataMlAiDomainReport(input: {
  readonly nodeCount: number;
  readonly kindCounts: readonly DomainKindCount[];
  readonly findingCount: number;
}): string {
  const top = input.kindCounts
    .slice(0, 2)
    .map((k) => `${k.count} ${k.kind}`)
    .join(" · ");
  const kinds = top || "no kinds";
  return `${input.nodeCount} nodes · ${kinds} · ${input.findingCount} findings`;
}
