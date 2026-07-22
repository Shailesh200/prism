import type {
  DnaReport,
  GitActivity,
  GraphSnapshotDto,
  UtilityOverlayReport,
} from "@prism/shared";
import {
  Activity,
  AppWindow,
  ArrowLeft,
  Cloud,
  Database,
  FileWarning,
  FlaskConical,
  Flame,
  Layers,
  Monitor,
  Network,
  Play,
  Plug,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";
import type { ComponentType, ReactElement } from "react";
import { useMemo, useState } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import "./overview.css";

type CiDispatchInput = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
};

function parseCiInputs(
  attrs: Record<string, unknown> | undefined,
): CiDispatchInput[] {
  const raw = attrs?.inputs;
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CiDispatchInput =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as CiDispatchInput).name === "string",
    );
  } catch {
    return [];
  }
}

type DomainIcon = ComponentType<{
  size?: number | string;
  "aria-hidden"?: boolean;
}>;

export type DomainOverlayStatus = "idle" | "loading" | "ready" | "error";

type DomainDef = {
  id: string;
  title: string;
  icon: DomainIcon;
  /** Core utility overlay kind, or `null` when the domain needs a lab run. */
  kind: string | null;
  surfaceLabel: string;
  description: string;
  sources: string;
  /** Copy for a domain that is opt-in but not yet wired (e.g. Lighthouse). */
  labNote?: string;
};

const DOMAINS: Record<string, DomainDef> = {
  backend: {
    id: "backend",
    title: "Backend · Services & APIs",
    icon: Server,
    kind: "api-surface",
    surfaceLabel: "API Surface",
    description:
      "Scans your services for route handlers, controllers, routers and API contracts (OpenAPI / gRPC) to map the backend surface.",
    sources: "route / controller / handler files, OpenAPI & proto specs",
  },
  devops_platform: {
    id: "devops_platform",
    title: "DevOps · Platform",
    icon: Cloud,
    kind: "iac-resources",
    surfaceLabel: "Infrastructure Surface",
    description:
      "Detects infrastructure-as-code, container and CI/CD assets to map platform resources.",
    sources: "IaC manifests, CI/CD config, Dockerfiles & compose files",
  },
  mobile: {
    id: "mobile",
    title: "Mobile",
    icon: Smartphone,
    kind: "mobile-nav",
    surfaceLabel: "Screen Manifest",
    description:
      "Detects mobile screens and navigators from Expo Router / React Navigation path markers (local heuristics).",
    sources: "app/ routes, screens/, navigation & Navigator files",
  },
  desktop: {
    id: "desktop",
    title: "Desktop",
    icon: AppWindow,
    kind: "desktop-boundary",
    surfaceLabel: "Process Surface",
    description:
      "Detects Electron/Tauri main, preload, renderer, and IPC-touching files to map the desktop process boundary.",
    sources:
      "main/preload/renderer entry files, ipcMain/contextBridge/invoke usage, tauri.conf",
  },
  data_ml_ai: {
    id: "data_ml_ai",
    title: "Data / ML",
    icon: Database,
    kind: "data-pipeline-dag",
    surfaceLabel: "Pipeline Surface",
    description:
      "Detects pipelines, DAGs, models and notebooks to map the data / ML surface.",
    sources: "DAG folders, dbt models, Spark jobs & notebooks",
  },
  frontend: {
    id: "frontend",
    title: "Web · Frontend",
    icon: Monitor,
    kind: null,
    surfaceLabel: "Performance Surface",
    description:
      "Runs a local Lighthouse lab to capture Core Web Vitals and attribute them to frontend regions.",
    sources: "local Lighthouse run or an imported CWV report",
    labNote: "The local Lighthouse lab pipeline is coming soon.",
  },
};

/**
 * Core Web Vitals we would surface once a local Lighthouse lab run (or an
 * imported CWV report) is available. Kept metadata-only — Prism does not
 * fabricate lab numbers, so tiles render an explicit "awaiting data" state.
 */
const CWV_METRICS: {
  id: string;
  name: string;
  goodLabel: string;
  poorLabel: string;
}[] = [
  {
    id: "LCP",
    name: "Largest Contentful Paint",
    goodLabel: "≤ 2.5s",
    poorLabel: "> 4.0s",
  },
  {
    id: "INP",
    name: "Interaction to Next Paint",
    goodLabel: "≤ 200ms",
    poorLabel: "> 500ms",
  },
  {
    id: "CLS",
    name: "Cumulative Layout Shift",
    goodLabel: "≤ 0.1",
    poorLabel: "> 0.25",
  },
  {
    id: "FCP",
    name: "First Contentful Paint",
    goodLabel: "≤ 1.8s",
    poorLabel: "> 3.0s",
  },
  {
    id: "TTFB",
    name: "Time to First Byte",
    goodLabel: "≤ 800ms",
    poorLabel: "> 1.8s",
  },
];

/** Node-kind → display label + accent (falls back to title-case + slate). */
const KIND_META: Record<string, { label: string; color: string }> = {
  handler: { label: "Handler", color: "#3B82F6" },
  "route-table": { label: "Routes", color: "#00C2C2" },
  openapi: { label: "OpenAPI", color: "#10B981" },
  "grpc-proto": { label: "gRPC", color: "#A855F7" },
  screen: { label: "Screen", color: "#6C63FF" },
  navigator: { label: "Navigator", color: "#00C2C2" },
  route: { label: "Route", color: "#3B82F6" },
  main: { label: "Main", color: "#F59E0B" },
  preload: { label: "Preload", color: "#00C2C2" },
  renderer: { label: "Renderer", color: "#6C63FF" },
  ipc: { label: "IPC", color: "#F43F5E" },
  "tauri-config": { label: "Tauri", color: "#FFC131" },
  test: { label: "Test", color: "#10B981" },
  "test-package": { label: "Test Pkg", color: "#10B981" },
  terraform: { label: "Terraform", color: "#7B42BC" },
  helm: { label: "Helm", color: "#0F1689" },
  kubernetes: { label: "Kubernetes", color: "#326CE5" },
  container: { label: "Container", color: "#2496ED" },
  ci: { label: "Pipeline", color: "#00C2C2" },
};

const SEVERITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

function titleCase(id: string): string {
  return id
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function kindLabel(kind: string): string {
  return KIND_META[kind]?.label ?? titleCase(kind);
}

function kindColor(kind: string): string {
  return KIND_META[kind]?.color ?? "#8AA0AA";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export type DomainScreenProps = {
  domainId: string;
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  overlay: UtilityOverlayReport | null;
  status: DomainOverlayStatus;
  /** Backend / Mobile Wave 1: reused Core signals. */
  security?: UtilityOverlayReport | null;
  qa?: UtilityOverlayReport | null;
  depGraph?: GraphSnapshotDto | null;
  gitActivity?: GitActivity | null;
  /** Stack DNA — Mobile / Desktop Wave 1 stack snapshot. */
  dna?: DnaReport | null;
  onRun: (kind: string) => void;
  onNavigate: (view: AppView) => void;
};

function nodePath(attrs: Record<string, unknown> | undefined): string {
  return typeof attrs?.path === "string" ? attrs.path : "";
}

function fileStem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base
    .replace(/\.(test|spec)\.[cm]?[jt]sx?$/i, "")
    .replace(/\.[cm]?[jt]sx?$/i, "")
    .replace(/\.(go|py|rb|java|rs)$/i, "")
    .toLowerCase();
}

export function DomainScreen(props: DomainScreenProps): ReactElement {
  const def = DOMAINS[props.domainId] ?? DOMAINS.backend!;
  const { overlay, status } = props;
  const [filter, setFilter] = useState("");

  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");
  const Icon = def.icon;

  const nodes = overlay?.graph.nodes ?? [];
  const findings = useMemo(
    () =>
      [...(overlay?.findings ?? [])].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
      ),
    [overlay],
  );

  const kindCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of nodes) map.set(n.kind, (map.get(n.kind) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const enriched = props.domainId === "backend";
  const isDevops = props.domainId === "devops_platform";
  const isMobile = props.domainId === "mobile";
  const isDesktop = props.domainId === "desktop";

  const ciNodes = useMemo(() => nodes.filter((n) => n.kind === "ci"), [nodes]);
  const iacNodes = useMemo(() => nodes.filter((n) => n.kind !== "ci"), [nodes]);
  const screenNodes = useMemo(
    () => nodes.filter((n) => n.kind === "screen"),
    [nodes],
  );
  const navigatorNodes = useMemo(
    () => nodes.filter((n) => n.kind === "navigator"),
    [nodes],
  );
  const expoScreens = useMemo(
    () => screenNodes.filter((n) => n.attrs?.router === "expo"),
    [screenNodes],
  );
  const desktopProcessNodes = useMemo(
    () =>
      nodes.filter((n) =>
        ["main", "preload", "renderer", "ipc", "tauri-config"].includes(n.kind),
      ),
    [nodes],
  );
  const kindCount = (kind: string): number =>
    nodes.reduce((acc, n) => acc + (n.kind === kind ? 1 : 0), 0);

  /** Mobile — screen file stem ↔ test file heuristic (qa-test-gaps). */
  const screenCoverage = useMemo(() => {
    if (!isMobile) return null;
    const testStems = (props.qa?.graph.nodes ?? [])
      .map((n) => fileStem(nodePath(n.attrs)))
      .filter(Boolean);
    const stemSet = new Set(testStems);
    const untested = screenNodes.filter((n) => {
      const s = fileStem(nodePath(n.attrs));
      if (s === "") return true;
      return !(stemSet.has(s) || testStems.some((t) => t.includes(s)));
    });
    return {
      total: screenNodes.length,
      tested: screenNodes.length - untested.length,
      untestedIds: new Set(untested.map((n) => n.id)),
    };
  }, [isMobile, screenNodes, props.qa]);

  /** Code handlers (exclude pure spec nodes) with a resolvable file path. */
  const handlers = useMemo(
    () =>
      nodes.filter(
        (n) =>
          nodePath(n.attrs) !== "" &&
          n.kind !== "openapi" &&
          n.kind !== "grpc-proto",
      ),
    [nodes],
  );

  /** Wave 1 — endpoint test coverage (handler stem ↔ test file heuristic). */
  const coverage = useMemo(() => {
    if (!enriched) return null;
    const testStems = (props.qa?.graph.nodes ?? [])
      .map((n) => fileStem(nodePath(n.attrs)))
      .filter(Boolean);
    const stemSet = new Set(testStems);
    const untested = handlers.filter((n) => {
      const s = fileStem(nodePath(n.attrs));
      if (s === "") return true;
      return !(stemSet.has(s) || testStems.some((t) => t.includes(s)));
    });
    return {
      total: handlers.length,
      tested: handlers.length - untested.length,
      untested,
    };
  }, [enriched, handlers, props.qa]);

  /** Wave 1 — most-depended-on handlers (in-degree from dependency graph). */
  const mostDepended = useMemo(() => {
    if (!enriched || !props.depGraph) return [];
    const inDeg = new Map<string, number>();
    for (const e of props.depGraph.edges) {
      if (e.to) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }
    return handlers
      .map((n) => ({
        node: n,
        deps: inDeg.get(`file:${nodePath(n.attrs)}`) ?? 0,
      }))
      .filter((x) => x.deps > 0)
      .sort((a, b) => b.deps - a.deps)
      .slice(0, 8);
  }, [enriched, handlers, props.depGraph]);

  /** Wave 1 — churn hotspots (handlers × local git history). */
  const churn = useMemo(() => {
    if (!enriched || !props.gitActivity) return [];
    const byPath = new Map(
      props.gitActivity.recentFiles.map((f) => [f.path, f]),
    );
    return handlers
      .map((n) => ({ node: n, file: byPath.get(nodePath(n.attrs)) }))
      .filter((x) => x.file !== undefined)
      .sort((a, b) => (b.file?.commits ?? 0) - (a.file?.commits ?? 0))
      .slice(0, 8);
  }, [enriched, handlers, props.gitActivity]);

  /** Mobile Wave 1 — most-depended-on screens. */
  const screenMostDepended = useMemo(() => {
    if (!isMobile || !props.depGraph) return [];
    const inDeg = new Map<string, number>();
    for (const e of props.depGraph.edges) {
      if (e.to) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }
    return screenNodes
      .map((n) => ({
        node: n,
        deps: inDeg.get(`file:${nodePath(n.attrs)}`) ?? 0,
      }))
      .filter((x) => x.deps > 0)
      .sort((a, b) => b.deps - a.deps)
      .slice(0, 8);
  }, [isMobile, screenNodes, props.depGraph]);

  /** Mobile Wave 1 — churn hotspots on screen files. */
  const screenChurn = useMemo(() => {
    if (!isMobile || !props.gitActivity) return [];
    const byPath = new Map(
      props.gitActivity.recentFiles.map((f) => [f.path, f]),
    );
    return screenNodes
      .map((n) => ({ node: n, file: byPath.get(nodePath(n.attrs)) }))
      .filter((x) => x.file !== undefined)
      .sort((a, b) => (b.file?.commits ?? 0) - (a.file?.commits ?? 0))
      .slice(0, 8);
  }, [isMobile, screenNodes, props.gitActivity]);

  /** Mobile Wave 1 — stack snapshot from DNA (Expo / RN / Flutter signals). */
  const mobileStack = useMemo(() => {
    if (!isMobile || !props.dna) return null;
    const signals = (props.dna.stack?.signals ?? [])
      .filter(
        (s) =>
          s.domain === "mobile" ||
          /^(mobile-|expo|react-native|flutter)/i.test(s.id),
      )
      .sort((a, b) => b.confidence - a.confidence);
    const frameworks = (props.dna.frameworks ?? []).filter((f) =>
      /expo|react-native|flutter|native/i.test(f),
    );
    const unique = new Map<string, (typeof signals)[number]>();
    for (const s of signals) {
      if (!unique.has(s.id)) unique.set(s.id, s);
    }
    return {
      frameworks,
      signals: [...unique.values()].slice(0, 8),
      detected: props.dna.stack?.domains?.includes("mobile") ?? false,
    };
  }, [isMobile, props.dna]);

  /** Desktop Wave 1 — most-depended-on process / IPC files. */
  const desktopMostDepended = useMemo(() => {
    if (!isDesktop || !props.depGraph) return [];
    const inDeg = new Map<string, number>();
    for (const e of props.depGraph.edges) {
      if (e.to) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }
    return desktopProcessNodes
      .map((n) => ({
        node: n,
        deps: inDeg.get(`file:${nodePath(n.attrs)}`) ?? 0,
      }))
      .filter((x) => x.deps > 0)
      .sort((a, b) => b.deps - a.deps)
      .slice(0, 8);
  }, [isDesktop, desktopProcessNodes, props.depGraph]);

  /** Desktop Wave 1 — churn hotspots on desktop boundary files. */
  const desktopChurn = useMemo(() => {
    if (!isDesktop || !props.gitActivity) return [];
    const byPath = new Map(
      props.gitActivity.recentFiles.map((f) => [f.path, f]),
    );
    return desktopProcessNodes
      .map((n) => ({ node: n, file: byPath.get(nodePath(n.attrs)) }))
      .filter((x) => x.file !== undefined)
      .sort((a, b) => (b.file?.commits ?? 0) - (a.file?.commits ?? 0))
      .slice(0, 8);
  }, [isDesktop, desktopProcessNodes, props.gitActivity]);

  /** Desktop Wave 1 — stack snapshot from DNA (Electron / Tauri). */
  const desktopStack = useMemo(() => {
    if (!isDesktop || !props.dna) return null;
    const signals = (props.dna.stack?.signals ?? [])
      .filter(
        (s) =>
          s.domain === "desktop" || /^(desktop-|electron|tauri)/i.test(s.id),
      )
      .sort((a, b) => b.confidence - a.confidence);
    const frameworks = (props.dna.frameworks ?? []).filter((f) =>
      /electron|tauri/i.test(f),
    );
    const unique = new Map<string, (typeof signals)[number]>();
    for (const s of signals) {
      if (!unique.has(s.id)) unique.set(s.id, s);
    }
    return {
      frameworks,
      signals: [...unique.values()].slice(0, 8),
      detected: props.dna.stack?.domains?.includes("desktop") ?? false,
    };
  }, [isDesktop, props.dna]);

  /** Honest process-boundary links from the overlay (not per-channel IPC). */
  const desktopBoundaryLinks = useMemo(() => {
    if (!isDesktop || !overlay) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return (overlay.graph.edges ?? [])
      .map((e) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        return {
          id: e.id,
          kind: e.kind,
          fromLabel: from?.label.split("/").pop() ?? e.from,
          toLabel: to?.label.split("/").pop() ?? e.to,
          fromKind: from?.kind ?? "",
          toKind: to?.kind ?? "",
        };
      })
      .filter((l) => l.fromKind !== "" && l.toKind !== "");
  }, [isDesktop, overlay, nodes]);

  const securityNodes = props.security?.graph.nodes ?? [];
  const securityFindings = props.security?.findings ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q === "") return nodes;
    return nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        String(n.attrs?.path ?? "")
          .toLowerCase()
          .includes(q) ||
        n.kind.toLowerCase().includes(q),
    );
  }, [nodes, filter]);

  const severeFindings = findings.filter(
    (f) => f.severity === "high" || f.severity === "medium",
  ).length;

  // DevOps splits CI pipelines into their own card; Mobile Screen Manifest
  // focuses on screens (navigators get a separate card).
  const surfaceRows = isDevops
    ? filtered.filter((n) => n.kind !== "ci")
    : isMobile
      ? filtered.filter((n) => n.kind === "screen")
      : filtered;
  const surfaceTotal = isDevops
    ? iacNodes.length
    : isMobile
      ? screenNodes.length
      : nodes.length;
  const compCounts = isDevops
    ? kindCounts.filter(([k]) => k !== "ci")
    : kindCounts;
  const compTotal = compCounts.reduce((acc, [, c]) => acc + c, 0);

  const tiles: { label: string; value: number | string; warn?: boolean }[] =
    isMobile
      ? [
          { label: "Screens", value: screenNodes.length },
          { label: "Navigators", value: navigatorNodes.length },
          { label: "Expo Router", value: expoScreens.length },
          {
            label: "Untested",
            value: screenCoverage?.untestedIds.size ?? 0,
            warn: (screenCoverage?.untestedIds.size ?? 0) > 0,
          },
        ]
      : isDesktop
        ? [
            { label: "Main", value: kindCount("main") },
            { label: "Renderer", value: kindCount("renderer") },
            { label: "IPC Files", value: kindCount("ipc") },
            {
              label:
                kindCount("tauri-config") > 0 && kindCount("preload") === 0
                  ? "Tauri"
                  : "Preload",
              value:
                kindCount("tauri-config") > 0 && kindCount("preload") === 0
                  ? kindCount("tauri-config")
                  : kindCount("preload"),
            },
          ]
        : isDevops
          ? [
              { label: "IaC Resources", value: iacNodes.length },
              { label: "Pipelines", value: ciNodes.length },
              { label: "Containers", value: kindCount("container") },
              { label: "Kubernetes", value: kindCount("kubernetes") },
            ]
          : enriched
            ? [
                { label: "Detected Nodes", value: nodes.length },
                { label: "Handlers", value: handlers.length },
                {
                  label: "Untested",
                  value: coverage?.untested.length ?? 0,
                  warn: (coverage?.untested.length ?? 0) > 0,
                },
                { label: "Security Files", value: securityNodes.length },
              ]
            : [
                { label: "Detected Nodes", value: nodes.length },
                ...kindCounts
                  .slice(0, 2)
                  .map((k) => ({ label: kindLabel(k[0]), value: k[1] })),
                {
                  label: "Findings",
                  value: findings.length,
                  warn: severeFindings > 0,
                },
              ].slice(0, 4);

  const canRun = def.kind !== null;
  const isFrontend = props.domainId === "frontend";

  return (
    <div className="ov">
      <AppSidebar
        variant="full"
        active="domains"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">{def.title}</div>
            <div className="ov-top__sub">{subtitle}</div>
          </div>
          <div className="ov-top__actions">
            <button
              type="button"
              className="ov-btn ov-btn--ghost"
              onClick={() => props.onNavigate("domains")}
            >
              <ArrowLeft size={13} aria-hidden />
              Back to Domains
            </button>
            {isFrontend ? (
              <button
                type="button"
                className="ov-btn ov-btn--primary"
                disabled
                title={def.labNote ?? "Coming soon"}
              >
                <FlaskConical size={13} aria-hidden />
                Run local lab
              </button>
            ) : status === "ready" && overlay ? (
              <button
                type="button"
                className="ov-btn ov-btn--primary"
                onClick={() => canRun && props.onRun(def.kind!)}
              >
                <RefreshCw size={13} aria-hidden />
                Re-run
              </button>
            ) : null}
          </div>
        </header>

        <div className="ov-scroll">
          {isFrontend ? (
            <>
              <section className="cwv">
                <h2 className="cwv__h">Core Web Vitals</h2>
                <div className="cwv__grid">
                  {CWV_METRICS.map((m) => (
                    <article key={m.id} className="cwv-tile" title={m.name}>
                      <div className="cwv-tile__head">
                        <span className="cwv-tile__k">{m.id}</span>
                        <span className="cwv-tile__badge">No data</span>
                      </div>
                      <div className="cwv-tile__v">—</div>
                      <div className="cwv-tile__band" aria-hidden>
                        <span className="cwv-tile__seg cwv-tile__seg--good" />
                        <span className="cwv-tile__seg cwv-tile__seg--warn" />
                        <span className="cwv-tile__seg cwv-tile__seg--poor" />
                      </div>
                      <div className="cwv-tile__hint">
                        Good {m.goodLabel} · Poor {m.poorLabel}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <div className="dm-idle dm-idle--inline">
                <div className="dm-idle__card">
                  <span className="dm-idle__icon" aria-hidden>
                    <Icon size={26} />
                  </span>
                  <h2 className="dm-idle__title">{def.title}</h2>
                  <p className="dm-idle__desc">{def.description}</p>
                  <p className="dm-idle__privacy">
                    Runs locally on demand — no network, no code leaves your
                    machine.
                  </p>
                  <div className="cwv-optin__actions">
                    <button
                      type="button"
                      className="ov-btn ov-btn--primary"
                      disabled
                      title={def.labNote ?? "Coming soon"}
                    >
                      <FlaskConical size={14} aria-hidden />
                      Run local lab
                    </button>
                    <button
                      type="button"
                      className="ov-btn ov-btn--ghost"
                      disabled
                      title="Import a Lighthouse / CrUX JSON report — coming soon"
                    >
                      <Upload size={14} aria-hidden />
                      Import CWV report
                    </button>
                  </div>
                  <span className="dm-idle__soon">
                    {def.labNote ?? "Coming soon"}
                  </span>
                  <p className="dm-idle__sources">
                    <span className="dm-idle__sources-k">What this reads</span>
                    {def.sources}
                  </p>
                </div>
              </div>

              <p className="dm-foot">
                Core Web Vitals are field/lab measurements — Prism never
                fabricates them. Numbers appear here after a local Lighthouse
                run or an imported CWV report.
              </p>
            </>
          ) : status === "loading" ? (
            <>
              <div className="dm-skel__runbar sk" />
              <section className="ov-kpis">
                {[0, 1, 2, 3].map((i) => (
                  <article key={i} className="ov-stat">
                    <span className="sk sk-line sk-line--sm" />
                    <span className="sk sk-line sk-line--xl" />
                  </article>
                ))}
              </section>
              <div className="card-masonry" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <article key={i} className="ov-card dm-skel__card">
                    <span className="sk sk-line sk-title" />
                    <span className="sk sk-line" />
                    <span className="sk sk-line" />
                    <span className="sk sk-line sk-line--sm" />
                  </article>
                ))}
              </div>
              <span className="ov-sr">Analyzing {def.title}…</span>
            </>
          ) : status !== "ready" || overlay === null ? (
            <div className="dm-idle">
              <div className="dm-idle__card">
                <span className="dm-idle__icon" aria-hidden>
                  <Icon size={26} />
                </span>
                <h2 className="dm-idle__title">{def.title}</h2>
                <p className="dm-idle__desc">{def.description}</p>
                <p className="dm-idle__privacy">
                  Runs locally on demand — no network, no code leaves your
                  machine.
                </p>
                {canRun ? (
                  <button
                    type="button"
                    className="ov-btn ov-btn--primary dm-idle__run"
                    onClick={() => props.onRun(def.kind!)}
                  >
                    <Play size={14} aria-hidden />
                    Run analysis
                  </button>
                ) : (
                  <span className="dm-idle__soon">
                    {def.labNote ?? "Coming soon"}
                  </span>
                )}
                <p className="dm-idle__sources">
                  <span className="dm-idle__sources-k">What this reads</span>
                  {def.sources}
                </p>
                {status === "error" ? (
                  <p className="dm-idle__err">
                    Analysis failed — check the repository path and try again.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="dm-runbar">
                <span className="dm-runbar__dot" aria-hidden />
                Last run {relativeTime(overlay.generatedAt)} · {overlay.summary}
              </div>

              <section className="ov-kpis">
                {tiles.map((t) => (
                  <article key={t.label} className="ov-stat">
                    <div className="ov-stat__head">
                      <span className="ov-stat__k">{t.label}</span>
                    </div>
                    <div
                      className={`ov-stat__v${t.warn ? " dm-stat--warn" : ""}`}
                    >
                      {t.value}
                    </div>
                  </article>
                ))}
              </section>

              <div className="card-masonry">
                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Layers size={14} className="ov-card__icon" aria-hidden />
                      {def.surfaceLabel}
                    </span>
                    <input
                      className="dm-filter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filter…"
                      spellCheck={false}
                      aria-label="Filter detected nodes"
                    />
                  </div>
                  {surfaceRows.length > 0 ? (
                    <div
                      className={`dm-surface${isMobile ? " dm-surface--mobile" : ""}`}
                    >
                      <div className="dm-surface__head">
                        {isMobile ? (
                          <>
                            <span>Screen</span>
                            <span>File</span>
                            <span>Router</span>
                            <span>Tests</span>
                          </>
                        ) : (
                          <>
                            <span>Kind</span>
                            <span>Name</span>
                            <span>File</span>
                          </>
                        )}
                      </div>
                      <div className="dm-surface__body">
                        {surfaceRows.map((n) => {
                          const path = String(n.attrs?.path ?? "");
                          const base =
                            path
                              .split("/")
                              .pop()
                              ?.replace(/\.[^.]+$/, "") ?? n.label;
                          const tested =
                            screenCoverage !== null &&
                            !screenCoverage.untestedIds.has(n.id);
                          return (
                            <div key={n.id} className="dm-surface__row">
                              {isMobile ? (
                                <>
                                  <span className="dm-surface__name ov-ellipsis">
                                    {base}
                                  </span>
                                  <span
                                    className="dm-surface__path ov-mono ov-ellipsis"
                                    title={path}
                                  >
                                    {path || "—"}
                                  </span>
                                  <span className="dm-surface__router ov-mono">
                                    {n.attrs?.router === "expo" ? "expo" : "—"}
                                  </span>
                                  <span
                                    className={`dm-surface__test${
                                      tested
                                        ? " dm-surface__test--ok"
                                        : " dm-surface__test--miss"
                                    }`}
                                  >
                                    {screenCoverage
                                      ? tested
                                        ? "yes"
                                        : "no"
                                      : "—"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span
                                    className="dm-kind"
                                    style={{
                                      color: kindColor(n.kind),
                                      borderColor: `color-mix(in srgb, ${kindColor(n.kind)} 34%, transparent)`,
                                      background: `color-mix(in srgb, ${kindColor(n.kind)} 13%, transparent)`,
                                    }}
                                  >
                                    {kindLabel(n.kind)}
                                  </span>
                                  <span className="dm-surface__name ov-ellipsis">
                                    {n.label}
                                  </span>
                                  <span
                                    className="dm-surface__path ov-mono ov-ellipsis"
                                    title={path}
                                  >
                                    {path || "—"}
                                  </span>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="ov-empty">
                      {surfaceTotal === 0
                        ? "No surface markers detected in this workspace."
                        : "No nodes match the filter."}
                    </p>
                  )}
                  {isMobile && screenCoverage ? (
                    <p className="dm-note">
                      Tests: filename heuristic vs qa-test-gaps (
                      {screenCoverage.tested}/{screenCoverage.total} matched).
                    </p>
                  ) : null}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Layers size={14} className="ov-card__icon" aria-hidden />
                      Composition
                    </span>
                  </div>
                  {compCounts.length > 0 ? (
                    <div className="dm-comp">
                      {compCounts.map(([kind, count]) => {
                        const pct =
                          compTotal > 0
                            ? Math.round((count / compTotal) * 100)
                            : 0;
                        return (
                          <div key={kind} className="dm-comp__row">
                            <div className="dm-comp__top">
                              <span className="dm-comp__label">
                                {kindLabel(kind)}
                              </span>
                              <span className="ov-mono dm-comp__count">
                                {count}
                              </span>
                            </div>
                            <div className="dm-comp__bar">
                              <span
                                className="dm-comp__fill"
                                style={{
                                  width: `${pct}%`,
                                  background: kindColor(kind),
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="ov-empty">Nothing detected.</p>
                  )}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <FileWarning
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Findings
                    </span>
                    {findings.length > 0 ? (
                      <span className="ov-card__meta">{findings.length}</span>
                    ) : null}
                  </div>
                  {findings.length > 0 ? (
                    <div className="dm-findings">
                      {findings.map((f) => (
                        <div
                          key={f.id}
                          className="dm-finding"
                          data-sev={f.severity}
                        >
                          <div className="dm-finding__row">
                            <ShieldAlert size={13} aria-hidden />
                            <span className="dm-finding__msg">{f.message}</span>
                          </div>
                          {f.path ? (
                            <span className="dm-finding__path ov-mono ov-ellipsis">
                              {f.path}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ov-empty">
                      No findings — surface looks clean.
                    </p>
                  )}
                </article>

                {isMobile ? (
                  <>
                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Smartphone
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Navigators
                        </span>
                        <span className="ov-card__meta">
                          {navigatorNodes.length}
                        </span>
                      </div>
                      {navigatorNodes.length > 0 ? (
                        <div className="dm-rank">
                          {navigatorNodes.map((n) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {n.label.split("/").pop() ?? n.label}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {nodePath(n.attrs)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No navigation.* / Navigator files detected.
                        </p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Sparkles
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Mobile Stack
                        </span>
                        {mobileStack?.detected ? (
                          <span className="ov-card__meta">Detected</span>
                        ) : null}
                      </div>
                      {mobileStack &&
                      (mobileStack.frameworks.length > 0 ||
                        mobileStack.signals.length > 0) ? (
                        <>
                          {mobileStack.frameworks.length > 0 ? (
                            <div className="dm-pipe__tags dm-mobile-stack__fw">
                              {mobileStack.frameworks.map((f) => (
                                <span
                                  key={f}
                                  className="dm-pipe__ev dm-pipe__ev--dispatch"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {mobileStack.signals.length > 0 ? (
                            <div className="dm-rank">
                              {mobileStack.signals.map((s) => (
                                <div key={s.id} className="dm-rank__row">
                                  <div className="dm-rank__main">
                                    <span className="dm-rank__name ov-ellipsis">
                                      {s.id}
                                    </span>
                                    <span className="dm-rank__path ov-mono ov-ellipsis">
                                      {(s.evidence ?? [])
                                        .slice(0, 2)
                                        .join(" · ") || s.domain}
                                    </span>
                                  </div>
                                  <span className="dm-rank__val ov-mono">
                                    {Math.round(s.confidence * 100)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="ov-empty">
                          No mobile stack signals in Codebase DNA yet.
                        </p>
                      )}
                      <p className="dm-note">
                        From stack DNA (Expo / React Native / Flutter
                        detectors).
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Flame
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Screen Churn Hotspots
                        </span>
                      </div>
                      {screenChurn.length > 0 ? (
                        <div className="dm-rank">
                          {screenChurn.map(({ node: n, file }) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {nodePath(n.attrs).split("/").pop() ??
                                    n.label}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {nodePath(n.attrs)}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                {file?.commits ?? 0} commits
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No recent git changes to screen files.
                        </p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Network
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Most Depended-on Screens
                        </span>
                      </div>
                      {screenMostDepended.length > 0 ? (
                        <div className="dm-rank">
                          {screenMostDepended.map(({ node: n, deps }) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {nodePath(n.attrs).split("/").pop() ??
                                    n.label}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {nodePath(n.attrs)}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                {deps} dependents
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No inbound dependencies found for screens.
                        </p>
                      )}
                      <p className="dm-note">
                        In-degree from the file dependency graph
                        (getDependencyGraph).
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Network
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Navigation Topology
                        </span>
                        <span className="ov-card__meta">Deferred</span>
                      </div>
                      <p className="dm-defer__body">
                        The design&apos;s navigation graph, depth paths, and
                        unreachable-screen callouts need real{" "}
                        <span className="ov-mono">navigates</span> edges from
                        Core. Today&apos;s overlay only chains files in
                        discovery order — we won&apos;t draw a fake topology.
                      </p>
                      <p className="dm-note">
                        Also deferred: Platforms (iOS/Android), Deep Links.
                        Screen Manifest above uses real path heuristics only.
                      </p>
                    </article>
                  </>
                ) : null}

                {isDesktop ? (
                  <>
                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Network
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Boundary Links
                        </span>
                        <span className="ov-card__meta">
                          {desktopBoundaryLinks.length}
                        </span>
                      </div>
                      {desktopBoundaryLinks.length > 0 ? (
                        <div className="dm-rank">
                          {desktopBoundaryLinks.map((l) => (
                            <div key={l.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {kindLabel(l.fromKind)} →{" "}
                                  {kindLabel(l.toKind)}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {l.fromLabel} · {l.toLabel}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                {l.kind}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No main↔preload↔renderer links inferred yet.
                        </p>
                      )}
                      <p className="dm-note">
                        Structural edges from desktop-boundary (ipc / exposes /
                        loads) — not per-channel IPC.
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Sparkles
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Desktop Stack
                        </span>
                        {desktopStack?.detected ? (
                          <span className="ov-card__meta">Detected</span>
                        ) : null}
                      </div>
                      {desktopStack &&
                      (desktopStack.frameworks.length > 0 ||
                        desktopStack.signals.length > 0) ? (
                        <>
                          {desktopStack.frameworks.length > 0 ? (
                            <div className="dm-pipe__tags dm-mobile-stack__fw">
                              {desktopStack.frameworks.map((f) => (
                                <span
                                  key={f}
                                  className="dm-pipe__ev dm-pipe__ev--dispatch"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {desktopStack.signals.length > 0 ? (
                            <div className="dm-rank">
                              {desktopStack.signals.map((s) => (
                                <div key={s.id} className="dm-rank__row">
                                  <div className="dm-rank__main">
                                    <span className="dm-rank__name ov-ellipsis">
                                      {s.id}
                                    </span>
                                    <span className="dm-rank__path ov-mono ov-ellipsis">
                                      {(s.evidence ?? [])
                                        .slice(0, 2)
                                        .join(" · ") || s.domain}
                                    </span>
                                  </div>
                                  <span className="dm-rank__val ov-mono">
                                    {Math.round(s.confidence * 100)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="ov-empty">
                          No desktop stack signals in Codebase DNA yet.
                        </p>
                      )}
                      <p className="dm-note">
                        From stack DNA (Electron / Tauri detectors).
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Flame
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Process Churn Hotspots
                        </span>
                      </div>
                      {desktopChurn.length > 0 ? (
                        <div className="dm-rank">
                          {desktopChurn.map(({ node: n, file }) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {nodePath(n.attrs).split("/").pop() ??
                                    n.label}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {kindLabel(n.kind)} · {nodePath(n.attrs)}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                {file?.commits ?? 0} commits
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No recent git changes to desktop boundary files.
                        </p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Network
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Most Depended-on Process Files
                        </span>
                      </div>
                      {desktopMostDepended.length > 0 ? (
                        <div className="dm-rank">
                          {desktopMostDepended.map(({ node: n, deps }) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {nodePath(n.attrs).split("/").pop() ??
                                    n.label}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {kindLabel(n.kind)} · {nodePath(n.attrs)}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                {deps} dependents
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No inbound dependencies found for process files.
                        </p>
                      )}
                      <p className="dm-note">
                        In-degree from the file dependency graph
                        (getDependencyGraph).
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <AppWindow
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          IPC Channels &amp; Risk Callouts
                        </span>
                        <span className="ov-card__meta">Deferred</span>
                      </div>
                      <p className="dm-defer__body">
                        Per-channel IPC names, M↔R direction, schema validation,
                        Windows counts, native modules, unvalidated IPC, and
                        payload-leak callouts need richer Core scanners. Today
                        we only mark files that touch{" "}
                        <span className="ov-mono">ipcMain</span> /{" "}
                        <span className="ov-mono">contextBridge</span> /{" "}
                        <span className="ov-mono">invoke</span> — we won&apos;t
                        invent channel rows or risk metrics.
                      </p>
                      <p className="dm-note">
                        Process Surface + Boundary Links above use real
                        desktop-boundary nodes/edges only.
                      </p>
                    </article>
                  </>
                ) : null}

                {isDevops ? (
                  <>
                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Activity
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Active Pipelines
                        </span>
                        <span className="ov-card__meta">Soon</span>
                      </div>
                      <div className="dm-active">
                        <Plug size={18} aria-hidden />
                        <div>
                          <p className="dm-active__title">
                            Live runs need a GitHub integration
                          </p>
                          <p className="dm-active__body">
                            Connect GitHub under Integrations to list
                            in-progress and recent workflow runs (status,
                            branch, duration, actor). No network calls until you
                            opt in.
                          </p>
                        </div>
                      </div>
                      <p className="dm-note">
                        Local detection only shows workflow definitions. Active
                        status comes from the GitHub Actions API (ADR-0016).
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Workflow
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          CI/CD Pipelines
                        </span>
                        <span className="ov-card__meta">
                          {ciNodes.length} workflow
                          {ciNodes.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {ciNodes.length > 0 ? (
                        <div className="dm-pipes">
                          {ciNodes.map((n) => {
                            const events = String(n.attrs?.events ?? "")
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const jobs = String(n.attrs?.jobs ?? "")
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const dispatchers = String(
                              n.attrs?.dispatchers ?? "",
                            )
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const canTrigger = n.attrs?.canTrigger === true;
                            const inputs = parseCiInputs(n.attrs);
                            const dispatchTypes = String(
                              n.attrs?.dispatchTypes ?? "",
                            )
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const hasWorkflowDispatch =
                              dispatchers.includes("workflow_dispatch");
                            const hasRepoDispatch = dispatchers.includes(
                              "repository_dispatch",
                            );
                            return (
                              <div key={n.id} className="dm-pipe">
                                <div className="dm-pipe__head">
                                  <span className="dm-pipe__name ov-ellipsis">
                                    {n.label}
                                  </span>
                                  <span className="dm-pipe__prov">
                                    GitHub Actions
                                  </span>
                                </div>
                                <span
                                  className="dm-pipe__file ov-mono ov-ellipsis"
                                  title={nodePath(n.attrs)}
                                >
                                  {nodePath(n.attrs)}
                                </span>
                                {events.length > 0 ? (
                                  <div className="dm-pipe__row">
                                    <span className="dm-pipe__k">on</span>
                                    <div className="dm-pipe__tags">
                                      {events.map((e) => (
                                        <span
                                          key={e}
                                          className={`dm-pipe__ev${
                                            e === "workflow_dispatch" ||
                                            e === "repository_dispatch"
                                              ? " dm-pipe__ev--dispatch"
                                              : ""
                                          }`}
                                        >
                                          {e}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                                {jobs.length > 0 ? (
                                  <div className="dm-pipe__row">
                                    <span className="dm-pipe__k">jobs</span>
                                    <div className="dm-pipe__tags">
                                      {jobs.map((j) => (
                                        <span key={j} className="dm-pipe__job">
                                          {j}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                <div className="dm-pipe__trigger">
                                  {canTrigger && hasWorkflowDispatch ? (
                                    <>
                                      <div className="dm-pipe__trigger-h">
                                        Trigger · workflow_dispatch
                                      </div>
                                      {inputs.length > 0 ? (
                                        <div className="dm-pipe__inputs">
                                          {inputs.map((inp) => (
                                            <label
                                              key={inp.name}
                                              className="dm-pipe__field"
                                            >
                                              <span className="dm-pipe__field-k">
                                                {inp.name}
                                                {inp.required ? " *" : ""}
                                              </span>
                                              {inp.type === "boolean" ? (
                                                <select
                                                  className="dm-pipe__ctrl"
                                                  disabled
                                                  defaultValue={
                                                    inp.default === "true"
                                                      ? "true"
                                                      : "false"
                                                  }
                                                  aria-label={inp.name}
                                                >
                                                  <option value="false">
                                                    false
                                                  </option>
                                                  <option value="true">
                                                    true
                                                  </option>
                                                </select>
                                              ) : (
                                                <input
                                                  className="dm-pipe__ctrl"
                                                  type="text"
                                                  disabled
                                                  placeholder={
                                                    inp.default ??
                                                    inp.description ??
                                                    inp.type
                                                  }
                                                  aria-label={inp.name}
                                                />
                                              )}
                                            </label>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="dm-pipe__trigger-note">
                                          No inputs declared — can be triggered
                                          as-is once GitHub is connected.
                                        </p>
                                      )}
                                      <button
                                        type="button"
                                        className="ov-btn ov-btn--primary dm-pipe__run"
                                        disabled
                                        title="Connect GitHub under Integrations to trigger workflows"
                                      >
                                        <Play size={13} aria-hidden />
                                        Trigger workflow
                                      </button>
                                    </>
                                  ) : null}

                                  {canTrigger && hasRepoDispatch ? (
                                    <>
                                      <div className="dm-pipe__trigger-h">
                                        Trigger · repository_dispatch
                                      </div>
                                      {dispatchTypes.length > 0 ? (
                                        <label className="dm-pipe__field">
                                          <span className="dm-pipe__field-k">
                                            event type
                                          </span>
                                          <select
                                            className="dm-pipe__ctrl"
                                            disabled
                                            aria-label="repository_dispatch type"
                                          >
                                            {dispatchTypes.map((t) => (
                                              <option key={t} value={t}>
                                                {t}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      ) : (
                                        <p className="dm-pipe__trigger-note">
                                          Accepts repository_dispatch events
                                          (types not declared).
                                        </p>
                                      )}
                                      <button
                                        type="button"
                                        className="ov-btn ov-btn--ghost dm-pipe__run"
                                        disabled
                                        title="Connect GitHub under Integrations to dispatch events"
                                      >
                                        <Play size={13} aria-hidden />
                                        Dispatch event
                                      </button>
                                    </>
                                  ) : null}

                                  {!canTrigger ? (
                                    <p className="dm-pipe__trigger-note">
                                      No manual dispatcher — runs on{" "}
                                      {events.length > 0
                                        ? events.join(", ")
                                        : "configured events"}
                                      . Add{" "}
                                      <span className="ov-mono">
                                        workflow_dispatch
                                      </span>{" "}
                                      to enable a Trigger form.
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No CI/CD workflows detected under .github/workflows.
                        </p>
                      )}
                      <p className="dm-note">
                        Definitions parsed locally (jobs, triggers, dispatch
                        inputs). Live runs &amp; Trigger execute via
                        Integrations · GitHub. Argo / Jenkins / other repos come
                        later.
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Plug
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          DevOps Integrations
                        </span>
                        <span className="ov-card__meta">Soon</span>
                      </div>
                      <p className="dm-integ__lead">
                        Extra DevOps cards unlock only after you connect the
                        matching integration in Settings — never shown without a
                        connection, never fabricated.
                      </p>
                      <div className="dm-integ">
                        {[
                          {
                            id: "github",
                            name: "GitHub Actions",
                            unlocks: "Active runs · Trigger / Dispatch",
                          },
                          {
                            id: "argo",
                            name: "Argo CD / Workflows",
                            unlocks: "Apps · sync · drift · deploys",
                          },
                          {
                            id: "jenkins",
                            name: "Jenkins",
                            unlocks: "Jobs · last build · trigger",
                          },
                          {
                            id: "other-repo",
                            name: "Other-repo CI",
                            unlocks: "Pipelines from linked remotes",
                          },
                        ].map((c) => (
                          <div key={c.id} className="dm-integ__row">
                            <div className="dm-integ__main">
                              <span className="dm-integ__name">{c.name}</span>
                              <span className="dm-integ__unlocks">
                                {c.unlocks}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="ov-btn ov-btn--ghost dm-integ__btn"
                              disabled
                              title="Available once Settings → Integrations ships"
                            >
                              Connect
                              <span className="dm-integ__soon">Soon</span>
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="dm-note">
                        Implement after Settings → Integrations (ADR-0016 Phase
                        C). Connected integrations get real cards; disconnected
                        ones stay hidden.
                      </p>
                    </article>
                  </>
                ) : null}

                {enriched ? (
                  <>
                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <FlaskConical
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Endpoint Test Coverage
                        </span>
                        {coverage ? (
                          <span className="ov-card__meta">
                            {coverage.tested}/{coverage.total} covered
                          </span>
                        ) : null}
                      </div>
                      {coverage && coverage.total > 0 ? (
                        coverage.untested.length > 0 ? (
                          <div className="dm-findings">
                            {coverage.untested.map((n) => (
                              <div
                                key={n.id}
                                className="dm-finding"
                                data-sev="medium"
                              >
                                <div className="dm-finding__row">
                                  <FileWarning size={13} aria-hidden />
                                  <span className="dm-finding__msg ov-ellipsis">
                                    {n.label}
                                  </span>
                                  <span className="dm-tag dm-tag--warn">
                                    no test
                                  </span>
                                </div>
                                <span className="dm-finding__path ov-mono ov-ellipsis">
                                  {nodePath(n.attrs)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="ov-empty">
                            Every handler has a matching test file.
                          </p>
                        )
                      ) : (
                        <p className="ov-empty">No handlers to assess.</p>
                      )}
                      <p className="dm-note">
                        Heuristic: matches handler file names against detected
                        test files (qa-test-gaps).
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Flame
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Churn Hotspots
                        </span>
                      </div>
                      {churn.length > 0 ? (
                        <div className="dm-rank">
                          {churn.map(({ node: n, file }) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {n.label}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {nodePath(n.attrs)}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                {file?.commits ?? 0} commits
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No recent git changes to handlers.
                        </p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <ShieldCheck
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Security Surface
                        </span>
                        <span className="ov-card__meta">
                          {securityNodes.length} files
                        </span>
                      </div>
                      {securityFindings.length > 0 ? (
                        <div className="dm-findings">
                          {securityFindings.map((f) => (
                            <div
                              key={f.id}
                              className="dm-finding"
                              data-sev={f.severity}
                            >
                              <div className="dm-finding__row">
                                <ShieldAlert size={13} aria-hidden />
                                <span className="dm-finding__msg">
                                  {f.message}
                                </span>
                              </div>
                              {f.path ? (
                                <span className="dm-finding__path ov-mono ov-ellipsis">
                                  {f.path}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : securityNodes.length > 0 ? (
                        <div className="dm-rank">
                          {securityNodes.slice(0, 10).map((n) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {n.label}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {nodePath(n.attrs)}
                                </span>
                              </div>
                              <span
                                className="dm-kind"
                                style={{
                                  color: "#F59E0B",
                                  borderColor:
                                    "color-mix(in srgb, #F59E0B 34%, transparent)",
                                  background:
                                    "color-mix(in srgb, #F59E0B 13%, transparent)",
                                }}
                              >
                                {kindLabel(n.kind)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No auth / security-sensitive files detected.
                        </p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Network
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Most Depended-on
                        </span>
                      </div>
                      {mostDepended.length > 0 ? (
                        <div className="dm-rank">
                          {mostDepended.map(({ node: n, deps }) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {n.label}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {nodePath(n.attrs)}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                {deps} dependents
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No inbound dependencies found for handlers.
                        </p>
                      )}
                      <p className="dm-note">
                        In-degree from the file dependency graph
                        (getDependencyGraph).
                      </p>
                    </article>
                  </>
                ) : null}
              </div>

              <p className="dm-foot">
                Inferred from {def.sources}. Local heuristics only — no network.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
