import type {
  BackendReport,
  CwvMetric,
  CwvReport,
  DnaReport,
  GitActivity,
  GraphSnapshotDto,
  UtilityOverlayFinding,
  UtilityOverlayReport,
} from "@prism/shared";
import {
  CardIcon,
  Input,
  InfoTip,
  SearchableInput,
  Select,
  ToggleGroup,
} from "@prism/ui";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  Boxes,
  Cloud,
  ChevronRight,
  Database,
  ExternalLink,
  ChevronDown,
  FileClock,
  FileWarning,
  FlaskConical,
  Flame,
  Layers,
  ListChecks,
  Loader2,
  Monitor,
  Network,
  Package,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Table2,
  Upload,
  Workflow,
  X,
} from "lucide-react";
import type { ComponentType, ReactElement, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { Avatar } from "./Avatar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { useAppShellClient } from "./client-context.js";
import {
  BundleWeightPanel,
  type BundleWeightPanelHandle,
} from "./BundleWeightPanel.js";
import {
  LIGHTHOUSE_CATEGORIES,
  cwvReportFromLighthouseJson,
  formatCwvValue,
  heuristicFrontendRoutes,
  metricsFromLighthouseJson,
  ratingClass,
  ratingLabel,
  scoreRating,
} from "./cwv-parse.js";
import {
  dispatchGithubWorkflow,
  fetchGithubAuthenticatedLogin,
  fetchGithubRepo,
  fetchGithubWorkflowRuns,
  fetchGithubWorkflows,
  fetchPagespeedMetrics,
  matchRemoteWorkflowId,
  parseGithubRepoRef,
  testGithubRepoConnection,
  type GithubWorkflowRun,
  type GithubWorkflowSummary,
} from "./github-ci.js";
import {
  loadIntegrationsState,
  isLighthouseEnabledInFrontend,
  loadRemoteRepos,
  removeRemoteRepo,
  upsertRemoteRepo,
  type RemoteDevopsRepo,
} from "./integrations-store.js";
import { loadSettings } from "./settings-store.js";

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
      "Extracts Express / Nest / Fastify routes (METHOD /path), auth exposure, test linkage, data layer, env vars, and background work via Core backend report — plus the api-surface overlay for Map.",
    sources:
      "route handlers, controllers, models/migrations, env usage, queues",
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
      "Runs a local Lighthouse lab to capture Core Web Vitals and a consent-gated Bundle Weight analyze for chunk/module sizes.",
    sources: "local Lighthouse run, imported CWV report, or local bundle stats",
    labNote:
      "Runs a real local Lighthouse lab via Core. Requires Chrome/Chromium and a locally served app — never shows sample numbers. Bundle Weight runs separately with Analyze in the Bundle / Weight section.",
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
  desc: string;
}[] = [
  {
    id: "LCP",
    name: "Largest Contentful Paint",
    goodLabel: "≤ 2.5s",
    poorLabel: "> 4.0s",
    desc: "Time until the largest visible element (hero image, headline block) finishes rendering. Measures perceived load speed.",
  },
  {
    id: "INP",
    name: "Interaction to Next Paint",
    goodLabel: "≤ 200ms",
    poorLabel: "> 500ms",
    desc: "Responsiveness — the delay between a user interaction (tap/click/keypress) and the next visual update. Replaces FID.",
  },
  {
    id: "CLS",
    name: "Cumulative Layout Shift",
    goodLabel: "≤ 0.1",
    poorLabel: "> 0.25",
    desc: "Visual stability — how much page content unexpectedly shifts during load. Lower is better (unitless score).",
  },
  {
    id: "FCP",
    name: "First Contentful Paint",
    goodLabel: "≤ 1.8s",
    poorLabel: "> 3.0s",
    desc: "Time until the first piece of text or image is painted — the first signal the page is loading.",
  },
  {
    id: "TTFB",
    name: "Time to First Byte",
    goodLabel: "≤ 800ms",
    poorLabel: "> 1.8s",
    desc: "Server responsiveness — time from navigation start until the first byte of the response arrives.",
  },
];

/** Tooltip copy for non-CWV Lighthouse triage metrics. */
const TBT_DESC =
  "Total Blocking Time — the sum of time the main thread was blocked by long tasks during load. A lab proxy for INP (not a Core Web Vital).";

/** Node-kind → display label + accent (falls back to title-case + slate). */
const KIND_META: Record<string, { label: string; color: string }> = {
  handler: { label: "Handler", color: "#3B82F6" },
  "route-table": { label: "Routes", color: "#00C2C2" },
  openapi: { label: "OpenAPI", color: "#10B981" },
  "grpc-proto": { label: "gRPC", color: "#A855F7" },
  screen: { label: "Screen", color: "#6C63FF" },
  navigator: { label: "Navigator", color: "#00C2C2" },
  hook: { label: "Hook", color: "#F59E0B" },
  service: { label: "Service", color: "#3B82F6" },
  module: { label: "Module", color: "#A855F7" },
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
  model: { label: "Models", color: "#3B82F6" },
  migration: { label: "Migrations", color: "#00C2C2" },
  sql: { label: "SQL", color: "#10B981" },
  client: { label: "DB Clients", color: "#A855F7" },
};

const SEVERITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/**
 * Local persistence for domain screens so reopening a domain shows the
 * last-synced data without auto-re-running analysis (M-046 follow-up #5/#14).
 * Everything is namespaced per repo + domain and kept local (no network).
 */
function domainStoreKey(
  repoLabel: string,
  domainId: string,
  slot: string,
): string {
  return `prism:dm:${repoLabel}:${domainId}:${slot}`;
}

function readStore<T>(key: string): T | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** Persisted Frontend CWV snapshot (survives tab switches). */
type CwvSnapshot = {
  local: CwvReport | null;
  pagespeed: CwvReport | null;
  tbtMs: number | null;
  at: number;
  fellBack: boolean;
};

/** Persisted overlay run so reopening shows last-synced data (all domains). */
type OverlaySnapshot = {
  overlay: UtilityOverlayReport;
  at: number;
};

type CwvSource = "local" | "pagespeed";

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

function relativeTime(isoOrMs: string | number): string {
  const then =
    typeof isoOrMs === "number" ? isoOrMs : new Date(isoOrMs).getTime();
  if (Number.isNaN(then)) return "just now";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Readable status tag for GitHub Actions run status/conclusion. */
function PipelineStatusTag(props: {
  status: string;
  conclusion: string | null;
}): ReactElement {
  const raw = ((props.conclusion ?? props.status) || "unknown").toLowerCase();
  const label = raw.replace(/_/g, " ");
  let tone: "ok" | "fail" | "cancel" | "progress" | "neutral" = "neutral";
  if (raw === "success") tone = "ok";
  else if (
    raw === "failure" ||
    raw === "timed_out" ||
    raw === "startup_failure" ||
    raw === "action_required"
  ) {
    tone = "fail";
  } else if (raw === "cancelled" || raw === "canceled" || raw === "skipped") {
    tone = "cancel";
  } else if (
    raw === "in_progress" ||
    raw === "queued" ||
    raw === "pending" ||
    raw === "waiting" ||
    raw === "requested" ||
    raw === "waiting_for_approval"
  ) {
    tone = "progress";
  }
  return (
    <span className={`dm-run-tag dm-run-tag--${tone}`} title={label}>
      {label}
    </span>
  );
}

/** Actor cell — GitHub avatar image (initials fallback). */
function PipelineActor(props: {
  login: string | null;
  avatarUrl: string | null;
}): ReactElement {
  const [imgOk, setImgOk] = useState(true);
  if (!props.login) {
    return <span className="dm-pipe-actor dm-pipe-actor--empty">—</span>;
  }
  const showImg = Boolean(props.avatarUrl) && imgOk;
  return (
    <span className="dm-pipe-actor" title={`@${props.login}`}>
      {showImg ? (
        <img
          className="dm-pipe-actor__img"
          src={props.avatarUrl ?? undefined}
          alt=""
          width={24}
          height={24}
          onError={() => setImgOk(false)}
        />
      ) : (
        <Avatar name={props.login} size={24} />
      )}
    </span>
  );
}

/** Full-width Active Pipelines table. */
function PipelineRunsTable(props: {
  runs: readonly GithubWorkflowRun[];
}): ReactElement {
  return (
    <div className="dm-pipe-table-wrap">
      <table className="dm-pipe-table">
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Run</th>
            <th scope="col">Branch</th>
            <th scope="col">Event</th>
            <th scope="col" className="dm-pipe-table__actor-h">
              Actor
            </th>
          </tr>
        </thead>
        <tbody>
          {props.runs.map((run) => {
            const title = run.displayTitle || run.name;
            return (
              <tr key={run.id}>
                <td>
                  <PipelineStatusTag
                    status={run.status}
                    conclusion={run.conclusion}
                  />
                </td>
                <td>
                  {run.htmlUrl ? (
                    <a
                      className="dm-pipe-table__link"
                      href={run.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open run on GitHub · ${title}`}
                    >
                      <span className="dm-pipe-table__name ov-ellipsis">
                        {title}
                      </span>
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : (
                    <span className="dm-pipe-table__name ov-ellipsis">
                      {title}
                    </span>
                  )}
                </td>
                <td>
                  <span className="dm-pipe-table__branch ov-mono">
                    {run.headBranch || "—"}
                  </span>
                </td>
                <td>
                  <span className="dm-pipe-table__event ov-mono">
                    {run.event || "—"}
                  </span>
                </td>
                <td className="dm-pipe-table__actor">
                  <PipelineActor
                    login={run.actorLogin}
                    avatarUrl={run.actorAvatarUrl}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const DEVOPS_KPI_TIPS: Record<string, string> = {
  "IaC Resources":
    "Terraform, Helm, Kubernetes manifests, and related infra files detected under the workspace (local heuristics).",
  Pipelines:
    "CI workflow definitions from .github/workflows plus any Other Repo CI workflows fetched when GitHub is connected.",
  Containers: "Dockerfiles and compose files detected in the repository tree.",
  Kubernetes:
    "Deployment / Service / Ingress / Kustomization YAML paths matched by name heuristics.",
};

type Tile = {
  label: string;
  value: number | string;
  warn?: boolean;
  tip?: string;
};

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
  /** Route-granular backend report from Core `getBackendReport` (M-044). */
  backendReport?: BackendReport | null;
  gitActivity?: GitActivity | null;
  /** Stack DNA — Mobile / Desktop Wave 1 stack snapshot. */
  dna?: DnaReport | null;
  onRun: (kind: string) => void;
  onNavigate: (view: AppView) => void;
};

function nodePath(attrs: Record<string, unknown> | undefined): string {
  return typeof attrs?.path === "string" ? attrs.path : "";
}

function normalizeDepKey(idOrPath: string): string {
  let p = idOrPath.trim().replace(/\\/g, "/");
  if (p.startsWith("file:")) p = p.slice("file:".length);
  p = p.replace(/^\.\//, "");
  return p;
}

function inboundDepCounts(
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

function lookupInbound(inDeg: Map<string, number>, path: string): number {
  const key = normalizeDepKey(path);
  if (!key) return 0;
  return inDeg.get(key) ?? 0;
}

function fileStem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base
    .replace(/\.(test|spec)\.[cm]?[jt]sx?$/i, "")
    .replace(/\.[cm]?[jt]sx?$/i, "")
    .replace(/\.(go|py|rb|java|rs)$/i, "")
    .toLowerCase();
}

function shortProcessLabel(label: string, kind: string, path: string): string {
  const base = (path || label).split("/").pop() ?? label;
  if (base.includes(" · ")) return base;
  return `${base} · ${kindLabel(kind)}`;
}

export function DomainScreen(props: DomainScreenProps): ReactElement {
  const def = DOMAINS[props.domainId] ?? DOMAINS.backend!;
  const client = useAppShellClient();
  const [filter, setFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [coverageFilter, setCoverageFilter] = useState("");
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  // Analyze-only-on-click: fall back to the last locally-cached overlay run so
  // reopening a domain shows last-synced data instead of re-running (#14).
  const overlayCacheKey = domainStoreKey(
    props.repoLabel,
    props.domainId,
    "overlay",
  );
  const [cachedOverlay, setCachedOverlay] = useState<OverlaySnapshot | null>(
    () => readStore<OverlaySnapshot>(overlayCacheKey),
  );
  // On open the host reports "idle" (no auto-run). If we have a cached run,
  // surface it as "ready" so the user sees last-synced data with a timestamp
  // and can re-analyse on demand. "loading"/"error" keep host semantics.
  const useCached =
    !props.overlay && props.status === "idle" && !!cachedOverlay;
  const overlay = props.overlay ?? (useCached ? cachedOverlay!.overlay : null);
  const status: DomainOverlayStatus = useCached ? "ready" : props.status;

  // Frontend / CWV state
  const [cwvLocal, setCwvLocal] = useState<CwvReport | null>(null);
  const [cwvPagespeed, setCwvPagespeed] = useState<CwvReport | null>(null);
  const [cwvTbtMs, setCwvTbtMs] = useState<number | null>(null);
  const [labBusy, setLabBusy] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [labFellBack, setLabFellBack] = useState(false);
  /** Per-route Lighthouse console lines during progressive multi-route labs. */
  const [routeLabLogs, setRouteLabLogs] = useState<Record<string, string[]>>(
    {},
  );
  /** Route currently under Lighthouse during a progressive multi-route lab. */
  const [labMeasuringRoute, setLabMeasuringRoute] = useState<string | null>(
    null,
  );
  const labMeasuringRef = useRef<string | null>(null);
  /** Which section route-Analyze menu is open (`cwv` | `lh`). */
  const [labMenuOpen, setLabMenuOpen] = useState<"cwv" | "lh" | null>(null);
  const [topAnalyzeMenuOpen, setTopAnalyzeMenuOpen] = useState(false);
  const [labSelectMode, setLabSelectMode] = useState(false);
  const [selectedLabRoutes, setSelectedLabRoutes] = useState<string[]>([]);
  const cwvLabMenuRef = useRef<HTMLDivElement | null>(null);
  const lhLabMenuRef = useRef<HTMLDivElement | null>(null);
  const topAnalyzeMenuRef = useRef<HTMLDivElement | null>(null);
  const bundlePanelRef = useRef<BundleWeightPanelHandle | null>(null);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [cwvAccOpen, setCwvAccOpen] = useState(true);
  const [lhAccOpen, setLhAccOpen] = useState(true);
  const [bundleAccOpen, setBundleAccOpen] = useState(true);
  const [insightFilter, setInsightFilter] = useState<string | null>(null);
  const [pagespeedUrl, setPagespeedUrl] = useState("https://example.com");
  const [pagespeedBusy, setPagespeedBusy] = useState(false);
  const [pagespeedError, setPagespeedError] = useState<string | null>(null);
  const [cwvRestored, setCwvRestored] = useState(false);
  const [cwvSource, setCwvSource] = useState<CwvSource>("local");
  const [cwvSettingsOpen, setCwvSettingsOpen] = useState(false);
  const [discoveredRoutes, setDiscoveredRoutes] = useState<string[]>([]);
  const cwvSettingsRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const cwvStoreKey = domainStoreKey(props.repoLabel, "frontend", "cwv");

  // DevOps / GitHub live state
  const [remoteWorkflows, setRemoteWorkflows] = useState<
    GithubWorkflowSummary[]
  >([]);
  const [remoteRuns, setRemoteRuns] = useState<GithubWorkflowRun[]>([]);
  const [githubActor, setGithubActor] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [myTriggeredOnly, setMyTriggeredOnly] = useState(false);
  const [primaryRepoPrivate, setPrimaryRepoPrivate] = useState<boolean | null>(
    null,
  );
  const [wfBusy, setWfBusy] = useState<string | null>(null);
  const [wfResult, setWfResult] = useState<{
    id: string;
    ok: boolean;
    msg: string;
  } | null>(null);
  const [extraRepos, setExtraRepos] = useState<RemoteDevopsRepo[]>(() =>
    loadRemoteRepos(),
  );
  const [extraCi, setExtraCi] = useState<
    Record<
      string,
      {
        runs: GithubWorkflowRun[];
        workflows: GithubWorkflowSummary[];
        overlay: UtilityOverlayReport | null;
        error: string | null;
        busy: boolean;
      }
    >
  >({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{
    owner: string;
    repo: string;
  } | null>(null);
  const [githubRefreshKey, setGithubRefreshKey] = useState(0);

  const networkAllowed = loadSettings().allowNetworkIntegrations;
  const integrations = loadIntegrationsState();
  const githubConn = integrations.github;
  const pagespeedConn = integrations.pagespeed;
  const githubEnabled = githubConn?.enabled === true && networkAllowed;
  const githubToken = (githubConn?.config?.token ?? "").trim();
  const primaryOwner = (githubConn?.config?.owner ?? "").trim();
  const primaryRepo = (githubConn?.config?.repo ?? "").trim();
  /** Trigger forms: connected + network; private repos also need a token. */
  const triggersEnabled =
    githubEnabled && (primaryRepoPrivate !== true || githubToken !== "");
  const pagespeedEnabled =
    pagespeedConn?.enabled === true &&
    networkAllowed &&
    Boolean((pagespeedConn.config?.apiKey ?? "").trim());

  // A fresh overlay run from the host → persist it and mark "just now".
  useEffect(() => {
    if (props.status === "ready" && props.overlay) {
      const at = Date.now();
      setLastRunAt(at);
      const snapshot: OverlaySnapshot = { overlay: props.overlay, at };
      setCachedOverlay(snapshot);
      writeStore(overlayCacheKey, snapshot);
    }
  }, [
    props.status,
    props.overlay?.generatedAt,
    props.overlay?.summary,
    overlayCacheKey,
  ]);

  // Restore the cached run's "last run" label when the host has no live overlay.
  useEffect(() => {
    if (!props.overlay && cachedOverlay) {
      setLastRunAt(cachedOverlay.at);
    }
  }, [props.overlay, cachedOverlay]);

  // Re-read the cached overlay whenever the domain/repo changes (open ≠ re-run).
  useEffect(() => {
    setCachedOverlay(readStore<OverlaySnapshot>(overlayCacheKey));
  }, [overlayCacheKey]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Frontend: restore the last CWV report so switching tabs keeps it (#5).
  useEffect(() => {
    if (props.domainId !== "frontend") return;
    const snap = readStore<CwvSnapshot>(cwvStoreKey);
    if (snap) {
      setCwvLocal(snap.local);
      setCwvPagespeed(snap.pagespeed);
      setCwvTbtMs(
        snap.tbtMs ??
          (typeof snap.local?.tbtMs === "number" ? snap.local.tbtMs : null),
      );
      setLabFellBack(snap.fellBack);
      setLastRunAt((prev) => prev ?? snap.at);
    }
    setCwvRestored(true);
  }, [props.domainId, cwvStoreKey]);

  // Frontend: persist the CWV report whenever it changes (after restore).
  useEffect(() => {
    if (props.domainId !== "frontend" || !cwvRestored) return;
    if (!cwvLocal && !cwvPagespeed) return;
    const snapshot: CwvSnapshot = {
      local: cwvLocal,
      pagespeed: cwvPagespeed,
      tbtMs: cwvTbtMs,
      at: lastRunAt ?? Date.now(),
      fellBack: labFellBack,
    };
    writeStore(cwvStoreKey, snapshot);
  }, [
    props.domainId,
    cwvRestored,
    cwvLocal,
    cwvPagespeed,
    cwvTbtMs,
    lastRunAt,
    labFellBack,
    cwvStoreKey,
  ]);

  useEffect(() => {
    if (props.domainId !== "devops_platform" || !githubEnabled) {
      setRemoteWorkflows([]);
      setRemoteRuns([]);
      setGithubError(null);
      setPrimaryRepoPrivate(null);
      return;
    }
    const owner = primaryOwner;
    const repo = primaryRepo;
    const token = githubToken;
    if (!owner || !repo) {
      setGithubError("Configure GitHub owner/repo under Integrations.");
      return;
    }
    let cancelled = false;
    setGithubBusy(true);
    setGithubError(null);
    void (async () => {
      const cfg = { owner, repo, ...(token ? { token } : {}) };
      const [wf, runs, login, info] = await Promise.all([
        fetchGithubWorkflows(cfg),
        fetchGithubWorkflowRuns(cfg),
        token ? fetchGithubAuthenticatedLogin(token) : Promise.resolve(null),
        fetchGithubRepo(cfg),
      ]);
      if (cancelled) return;
      if (wf.ok) setRemoteWorkflows(wf.workflows);
      else setGithubError(wf.error);
      if (runs.ok) setRemoteRuns(runs.runs);
      else if (!wf.ok) {
        /* already set */
      } else setGithubError(runs.error);
      if (info.ok) setPrimaryRepoPrivate(info.repo.private);
      setGithubActor(login);
      setGithubBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    props.domainId,
    githubEnabled,
    primaryOwner,
    primaryRepo,
    githubToken,
    githubRefreshKey,
  ]);

  const refreshExtraRepo = async (entry: RemoteDevopsRepo): Promise<void> => {
    const key = `${entry.owner}/${entry.repo}`;
    const token = (entry.token ?? githubToken).trim();
    if (!networkAllowed || !githubEnabled) {
      setExtraCi((prev) => ({
        ...prev,
        [key]: {
          runs: [],
          workflows: [],
          overlay: null,
          error: "Enable GitHub + Allow network integrations first.",
          busy: false,
        },
      }));
      return;
    }
    setExtraCi((prev) => ({
      ...prev,
      [key]: {
        runs: prev[key]?.runs ?? [],
        workflows: prev[key]?.workflows ?? [],
        overlay: prev[key]?.overlay ?? null,
        error: null,
        busy: true,
      },
    }));
    const cfg = {
      owner: entry.owner,
      repo: entry.repo,
      ...(token ? { token } : {}),
    };
    try {
      let overlay: UtilityOverlayReport | null = null;
      if (client.stageDevopsRemote) {
        const staged = await client.stageDevopsRemote({
          owner: entry.owner,
          repo: entry.repo,
          ...(token ? { token } : {}),
          // Only reachable past the networkAllowed + githubEnabled guard above.
          consentGranted: true,
        });
        overlay = staged.overlay;
      }
      const [wf, runs] = await Promise.all([
        fetchGithubWorkflows(cfg),
        fetchGithubWorkflowRuns(cfg),
      ]);
      setExtraCi((prev) => ({
        ...prev,
        [key]: {
          runs: runs.ok ? runs.runs : [],
          workflows: wf.ok ? wf.workflows : [],
          overlay,
          error: !wf.ok ? wf.error : !runs.ok ? runs.error : null,
          busy: false,
        },
      }));
    } catch (err: unknown) {
      setExtraCi((prev) => ({
        ...prev,
        [key]: {
          runs: prev[key]?.runs ?? [],
          workflows: prev[key]?.workflows ?? [],
          overlay: prev[key]?.overlay ?? null,
          error: err instanceof Error ? err.message : String(err),
          busy: false,
        },
      }));
    }
  };

  useEffect(() => {
    if (props.domainId !== "devops_platform" || !githubEnabled) return;
    for (const entry of extraRepos) {
      // Skip remotes that duplicate the primary Integrations owner/repo.
      if (
        entry.owner.toLowerCase() === primaryOwner.toLowerCase() &&
        entry.repo.toLowerCase() === primaryRepo.toLowerCase()
      ) {
        continue;
      }
      void refreshExtraRepo(entry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on list/gate changes
  }, [
    props.domainId,
    githubEnabled,
    extraRepos,
    primaryOwner,
    primaryRepo,
    githubRefreshKey,
  ]);

  // After a local Analyze completes, refresh primary + remote Actions data.
  useEffect(() => {
    if (
      props.domainId !== "devops_platform" ||
      props.status !== "ready" ||
      !props.overlay
    ) {
      return;
    }
    setGithubRefreshKey((k) => k + 1);
  }, [props.domainId, props.status, props.overlay?.generatedAt]);

  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");
  const Icon = def.icon;

  const nodes = overlay?.graph.nodes ?? [];
  const findings = useMemo(() => {
    const base = [...(overlay?.findings ?? [])].sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
    );
    if (base.length > 0) return base;
    // Client-side fallback heuristics when overlay returned no findings
    const heuristic: UtilityOverlayFinding[] = [];
    if (props.domainId === "devops_platform") {
      for (const n of nodes.filter((x) => x.kind === "ci")) {
        if (heuristic.length >= 3) break;
        if (n.attrs?.hasConcurrency === false) {
          heuristic.push({
            id: `ui:concurrency:${n.id}`,
            message: `Workflow "${n.label}" has no concurrency group — parallel runs may overlap`,
            path: nodePath(n.attrs),
            severity: "low",
          });
        }
        if (n.attrs?.hasPermissions === false && heuristic.length < 3) {
          heuristic.push({
            id: `ui:permissions:${n.id}`,
            message: `Workflow "${n.label}" lacks top-level permissions — GITHUB_TOKEN may be overly broad`,
            path: nodePath(n.attrs),
            severity: "medium",
          });
        }
      }
    }
    return heuristic;
  }, [overlay, nodes, props.domainId]);

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

  /** Route-level coverage from Core BackendReport (replaces filename heuristic). */
  const coverage = useMemo(() => {
    if (!enriched) return null;
    const endpoints = props.backendReport?.endpoints ?? [];
    const untested = endpoints.filter((e) => !e.tested);
    return {
      total: endpoints.length,
      tested: endpoints.length - untested.length,
      untested,
    };
  }, [enriched, props.backendReport]);

  const routeRows = useMemo(() => {
    if (!enriched || !props.backendReport) return [];
    const q = routeFilter.trim().toLowerCase();
    const rows = props.backendReport.endpoints;
    if (!q) return rows;
    return rows.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        e.handlerFile.toLowerCase().includes(q) ||
        String((e as { handlerName?: string }).handlerName ?? "")
          .toLowerCase()
          .includes(q) ||
        e.framework.toLowerCase().includes(q) ||
        e.auth.toLowerCase().includes(q),
    );
  }, [enriched, props.backendReport, routeFilter]);

  const coverageRows = useMemo(() => {
    if (!coverage) return [];
    const q = coverageFilter.trim().toLowerCase();
    if (!q) return coverage.untested;
    return coverage.untested.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        e.handlerFile.toLowerCase().includes(q) ||
        String((e as { handlerName?: string }).handlerName ?? "")
          .toLowerCase()
          .includes(q),
    );
  }, [coverage, coverageFilter]);

  /** Wave 1 — most-depended-on handlers (in-degree from dependency graph). */
  const mostDepended = useMemo(() => {
    if (!enriched || !props.depGraph) return [];
    const inDeg = inboundDepCounts(props.depGraph);
    return handlers
      .map((n) => ({
        node: n,
        deps: lookupInbound(inDeg, nodePath(n.attrs)),
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
    const inDeg = inboundDepCounts(props.depGraph);
    return screenNodes
      .map((n) => ({
        node: n,
        deps: lookupInbound(inDeg, nodePath(n.attrs)),
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
    const inDeg = inboundDepCounts(props.depGraph);
    return desktopProcessNodes
      .map((n) => ({
        node: n,
        deps: lookupInbound(inDeg, nodePath(n.attrs)),
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

  /** Mobile navigates edges for Navigation Topology. */
  const mobileNavLinks = useMemo(() => {
    if (!isMobile || !overlay) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return (overlay.graph.edges ?? [])
      .filter((e) => e.kind === "navigates")
      .map((e) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        return {
          id: e.id,
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
      });
  }, [isMobile, overlay, nodes]);

  /** Desktop IPC channels from overlay findings / node attrs. */
  const desktopIpcChannels = useMemo(() => {
    if (!isDesktop || !overlay) return [];
    const rows: {
      name: string;
      source: string;
      path: string;
      risk: "low" | "medium";
    }[] = [];
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
            path: nodePath(n.attrs),
            risk: "low",
          });
        }
      }
    }
    return rows;
  }, [isDesktop, overlay, nodes]);

  /** Fixed 2×2 Data Layer grid (Models / Migrations / SQL / DB Clients). */
  const dataLayerGrid = useMemo(() => {
    const items = props.backendReport?.dataLayer ?? [];
    const map = new Map<string, number>();
    for (const d of items) map.set(d.kind, (map.get(d.kind) ?? 0) + 1);
    const meta: {
      kind: string;
      label: string;
      icon: LucideIcon;
      tone: "brand" | "violet" | "amber" | "emerald";
    }[] = [
      { kind: "model", label: "Models", icon: Database, tone: "brand" },
      {
        kind: "migration",
        label: "Migrations",
        icon: FileClock,
        tone: "amber",
      },
      { kind: "sql", label: "SQL", icon: Table2, tone: "emerald" },
      { kind: "client", label: "DB Clients", icon: Plug, tone: "violet" },
    ];
    return meta.map((m) => ({ ...m, count: map.get(m.kind) ?? 0 }));
  }, [props.backendReport]);

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

  const tiles: Tile[] = isMobile
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
            {
              label: "IaC Resources",
              value: iacNodes.length,
              tip: DEVOPS_KPI_TIPS["IaC Resources"]!,
            },
            {
              label: "Pipelines",
              value: ciNodes.length,
              tip: DEVOPS_KPI_TIPS.Pipelines!,
            },
            {
              label: "Containers",
              value: kindCount("container"),
              tip: DEVOPS_KPI_TIPS.Containers!,
            },
            {
              label: "Kubernetes",
              value: kindCount("kubernetes"),
              tip: DEVOPS_KPI_TIPS.Kubernetes!,
            },
          ]
        : enriched
          ? [
              {
                label: "Endpoints",
                value: props.backendReport?.endpoints.length ?? 0,
              },
              {
                label: "Untested",
                value: coverage?.untested.length ?? 0,
                warn: (coverage?.untested.length ?? 0) > 0,
              },
              {
                label: "Frameworks",
                value: props.backendReport?.frameworksDetected.length ?? 0,
              },
              {
                label: "Data Layer",
                value: props.backendReport?.dataLayer.length ?? 0,
              },
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

  const filteredRuns = useMemo(() => {
    if (!myTriggeredOnly) return remoteRuns;
    if (githubActor) {
      return remoteRuns.filter(
        (r) =>
          r.actorLogin !== null &&
          r.actorLogin.toLowerCase() === githubActor.toLowerCase(),
      );
    }
    return remoteRuns.filter((r) => r.event === "workflow_dispatch");
  }, [remoteRuns, myTriggeredOnly, githubActor]);

  const frontendRoutes = useMemo(() => {
    const stack = props.dna?.stack;
    const signals = stack?.signals?.map((s) => s.id) ?? [];
    const evidencePaths = [
      ...(stack?.signals ?? []).flatMap((s) => s.evidence ?? []),
      ...(stack?.packages ?? []).flatMap((p) =>
        (p.profile.signals ?? []).flatMap((s) => s.evidence ?? []),
      ),
    ];
    const heuristic = heuristicFrontendRoutes(signals, evidencePaths);
    const merged = new Set<string>([...heuristic, ...discoveredRoutes]);
    if (merged.size === 0) merged.add("/");
    return [...merged].sort((a, b) => {
      if (a === "/") return -1;
      if (b === "/") return 1;
      return a.localeCompare(b);
    });
  }, [props.dna, discoveredRoutes]);

  useEffect(() => {
    if (!isFrontend) return;
    let cancelled = false;
    const discover = client.discoverFrontendRoutes;
    if (!discover) return;
    void discover()
      .then((routes) => {
        if (!cancelled && Array.isArray(routes) && routes.length > 0) {
          setDiscoveredRoutes(routes);
        }
      })
      .catch(() => {
        /* keep heuristic fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [client, isFrontend, props.repoLabel]);

  // Report actually driving the frontend tiles (respects the CWV source pref).
  const cwvPrimaryReport =
    cwvSource === "pagespeed"
      ? (cwvPagespeed ?? cwvLocal)
      : (cwvLocal ?? cwvPagespeed);

  /** Lighthouse category scores (performance / a11y / best-practices / SEO). */
  const frontendCategories = useMemo(() => {
    const scores = cwvPrimaryReport?.categoryScores ?? {};
    return LIGHTHOUSE_CATEGORIES.map((c) => ({
      ...c,
      score: typeof scores[c.id] === "number" ? scores[c.id]! : null,
    })).filter((c) => c.score !== null);
  }, [cwvPrimaryReport]);

  /** Route breakdown: measured lab URL + DNA heuristic routes. */
  const routeBreakdown = useMemo(() => {
    const report = cwvPrimaryReport;
    const reportUrl = (report?.url ?? "").toLowerCase();
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
    const worstRating = (
      metrics: readonly CwvMetric[],
    ): CwvMetric["rating"] => {
      if (metrics.some((m) => m.rating === "poor")) return "poor";
      if (metrics.some((m) => m.rating === "needs-improvement"))
        return "needs-improvement";
      if (metrics.some((m) => m.rating === "good")) return "good";
      return "unknown";
    };
    const routeMatches = (route: string): boolean => {
      if (measuredRoute && route === measuredRoute) return true;
      if (!reportUrl) return false;
      if (route === "/") {
        return (
          reportUrl.endsWith("/") ||
          reportUrl.includes("127.0.0.1") ||
          reportUrl.includes("localhost")
        );
      }
      return reportUrl.includes(route.toLowerCase());
    };
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
        const metrics =
          rollup?.metrics ?? (matched ? (report?.metrics ?? []) : []);
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
  }, [frontendRoutes, cwvPrimaryReport]);

  /** Pain / improve / good insights from the lab report. */
  const insightGroups = useMemo(() => {
    const all = cwvPrimaryReport?.insights ?? [];
    const filtered =
      insightFilter === null
        ? all
        : all.filter((i) => i.metricId === insightFilter);
    return {
      pain: filtered.filter((i) => i.severity === "pain"),
      improve: filtered.filter((i) => i.severity === "improve"),
      good: filtered.filter((i) => i.severity === "good"),
    };
  }, [cwvPrimaryReport, insightFilter]);

  /** Component breakdown from rollups + attributions (never fabricated). */
  const componentBreakdown = useMemo(() => {
    const report = cwvPrimaryReport;
    const rows = new Map<
      string,
      {
        key: string;
        sampleCount: number;
        rating: CwvMetric["rating"];
        metrics: readonly CwvMetric[];
      }
    >();
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
        metrics: r.metrics,
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
  }, [cwvPrimaryReport]);

  useEffect(() => {
    if (!cwvSettingsOpen) return;
    const onPointerDown = (event: MouseEvent): void => {
      const root = cwvSettingsRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setCwvSettingsOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setCwvSettingsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [cwvSettingsOpen]);

  useEffect(() => {
    if (!labMenuOpen && !topAnalyzeMenuOpen) return;
    const onPointerDown = (event: MouseEvent): void => {
      const roots = [
        cwvLabMenuRef.current,
        lhLabMenuRef.current,
        topAnalyzeMenuRef.current,
      ];
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (roots.some((r) => r?.contains(t))) return;
      setLabMenuOpen(null);
      setTopAnalyzeMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setLabMenuOpen(null);
        setTopAnalyzeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [labMenuOpen, topAnalyzeMenuOpen]);

  /** Real Lighthouse unavailable — never invent sample numbers. */
  const applyNoLabAvailable = (reason: string): void => {
    setCwvLocal(null);
    setCwvTbtMs(null);
    setLabMeasuringRoute(null);
    labMeasuringRef.current = null;
    setLabFellBack(true);
    setLabError(reason);
  };

  const appendRouteLabLog = (route: string, message: string): void => {
    const line = message.trim();
    if (!line) return;
    setRouteLabLogs((prev) => {
      const cur = prev[route] ?? [];
      const next = [...cur, line];
      return {
        ...prev,
        [route]: next.length > 120 ? next.slice(-120) : next,
      };
    });
  };

  const runLocalLab = async (routes?: readonly string[]): Promise<void> => {
    setLabBusy(true);
    setLabError(null);
    setLabFellBack(false);
    setRouteLabLogs({});
    setLabMeasuringRoute(null);
    labMeasuringRef.current = null;
    setLabMenuOpen(null);
    setTopAnalyzeMenuOpen(false);
    setLabSelectMode(false);
    // Clear prior tiles / breakdown so re-run doesn't show stale numbers.
    setCwvLocal(null);
    setCwvTbtMs(null);
    setInsightFilter(null);
    try {
      if (!isLighthouseEnabledInFrontend()) {
        applyNoLabAvailable(
          "Enable Lighthouse / CWV under Integrations → Frontend, then retry Run local lab.",
        );
        return;
      }
      if (!networkAllowed) {
        applyNoLabAvailable(
          "Allow network integrations in Settings to install the Lighthouse CLI under .prism/tools (system Chrome is used; fixture scores are never shown).",
        );
        return;
      }
      if (!client.runLighthouseLab) {
        applyNoLabAvailable(
          "Local Lighthouse isn’t available in this host. To get real CWV scores: (1) run Prism from the VS Code / Cursor extension, (2) ensure Chrome or Chromium is installed, (3) keep your app running (e.g. http://localhost:3000) or let Prism start a production preview, then click Run local lab again. Or enable PageSpeed Insights under Integrations for remote lab scores.",
        );
        return;
      }
      let report: CwvReport | null = null;
      try {
        report = await client.runLighthouseLab({
          mode: "run",
          ...(routes && routes.length > 0 ? { routes: [...routes] } : {}),
          onProgress: (event) => {
            if (event.measuringRoute !== undefined) {
              labMeasuringRef.current = event.measuringRoute;
              setLabMeasuringRoute(event.measuringRoute);
            }
            if (event.message.trim() && labMeasuringRef.current) {
              appendRouteLabLog(labMeasuringRef.current, event.message);
            }
            if (event.report) {
              setCwvLocal(event.report);
              setCwvTbtMs(
                typeof event.report.tbtMs === "number"
                  ? event.report.tbtMs
                  : null,
              );
              setLabFellBack(false);
              setLabError(null);
            }
          },
        });
      } catch (err: unknown) {
        applyNoLabAvailable(
          err instanceof Error
            ? err.message
            : "Real Lighthouse run failed. Install Chrome/Chromium and serve the app locally, or use PageSpeed Insights from Integrations.",
        );
        return;
      }
      if (!report || report.source === "lab-fixture") {
        applyNoLabAvailable(
          "Real Lighthouse run unavailable (Chrome not found, or no frontend reachable / buildable). Install Chrome/Chromium, keep the app running on its usual port (3000 / 5173 / …), or allow Prism to build + preview — then retry. Or connect PageSpeed Insights under Integrations. Sample/dummy lab data is never shown.",
        );
        return;
      }
      setCwvLocal(report);
      setCwvTbtMs(typeof report.tbtMs === "number" ? report.tbtMs : null);
      setLabFellBack(false);
      setLastRunAt(Date.now());
    } catch (err: unknown) {
      applyNoLabAvailable(err instanceof Error ? err.message : String(err));
    } finally {
      setLabMeasuringRoute(null);
      labMeasuringRef.current = null;
      setLabBusy(false);
    }
  };

  const openLabRouteSelect = (source: "cwv" | "lh"): void => {
    setLabMenuOpen(null);
    setTopAnalyzeMenuOpen(false);
    setLabSelectMode(true);
    // Route picker lives under Core Web Vitals; open that accordion, and keep
    // Lighthouse open when the pick was started from there.
    setCwvAccOpen(true);
    if (source === "lh") setLhAccOpen(true);
    setSelectedLabRoutes((prev) =>
      prev.length > 0
        ? prev
        : frontendRoutes.includes("/")
          ? ["/"]
          : frontendRoutes.slice(0, 1),
    );
  };

  const runBundleAnalyzeFromPanel = async (): Promise<void> => {
    setTopAnalyzeMenuOpen(false);
    setLabMenuOpen(null);
    setBundleAccOpen(true);
    setBundleBusy(true);
    try {
      await bundlePanelRef.current?.runAnalyze();
    } finally {
      setBundleBusy(false);
    }
  };

  /** Sequential: local lab (all routes) then Bundle Analyze. */
  const runAnalyseEverything = async (): Promise<void> => {
    setTopAnalyzeMenuOpen(false);
    setCwvAccOpen(true);
    setLhAccOpen(true);
    setBundleAccOpen(true);
    await runLocalLab(frontendRoutes);
    await runBundleAnalyzeFromPanel();
  };

  const frontendBusy = labBusy || bundleBusy;

  const renderRouteAnalyzeMenu = (
    section: "cwv" | "lh",
    menuRef: RefObject<HTMLDivElement | null>,
  ): ReactElement => (
    <div className="dm-lab-menu" ref={menuRef}>
      <button
        type="button"
        className="ov-btn ov-btn--primary"
        disabled={frontendBusy}
        aria-expanded={labMenuOpen === section}
        aria-haspopup="menu"
        onClick={() => {
          setTopAnalyzeMenuOpen(false);
          setLabMenuOpen((v) => (v === section ? null : section));
        }}
      >
        {labBusy ? (
          <Loader2 size={13} aria-hidden className="bw-spin" />
        ) : (
          <FlaskConical size={13} aria-hidden />
        )}
        {labBusy ? "Analyzing…" : "Analyze"}
        <ChevronDown size={13} aria-hidden />
      </button>
      {labMenuOpen === section && !frontendBusy ? (
        <div className="dm-lab-menu__pop" role="menu">
          <button
            type="button"
            className="dm-lab-menu__item"
            role="menuitem"
            onClick={() => void runLocalLab(frontendRoutes)}
          >
            <ListChecks size={14} aria-hidden />
            Analyse all routes
            <span className="dm-lab-menu__meta">
              {frontendRoutes.length} listed
            </span>
          </button>
          <button
            type="button"
            className="dm-lab-menu__item"
            role="menuitem"
            onClick={() => openLabRouteSelect(section)}
          >
            <FlaskConical size={14} aria-hidden />
            Analyse selected routes…
          </button>
        </div>
      ) : null}
    </div>
  );

  const onImportCwv = (file: File | undefined): void => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const json: unknown = JSON.parse(text);
        const parsed = metricsFromLighthouseJson(json);
        if (parsed.metrics.length === 0) {
          setLabError("No LCP/INP/CLS/FCP audits found in that JSON.");
          return;
        }
        setCwvLocal(cwvReportFromLighthouseJson(json, "ingest"));
        setCwvTbtMs(parsed.tbtMs);
        setLabError(null);
        setLabFellBack(false);
        setLastRunAt(Date.now());
      } catch (err: unknown) {
        setLabError(
          err instanceof Error ? err.message : "Failed to parse CWV JSON",
        );
      }
    };
    reader.readAsText(file);
  };

  const fetchPagespeed = async (): Promise<void> => {
    const key = (pagespeedConn?.config?.apiKey ?? "").trim();
    setPagespeedBusy(true);
    setPagespeedError(null);
    try {
      const result = await fetchPagespeedMetrics(key, pagespeedUrl);
      if (!result.ok) {
        setPagespeedError(result.error);
        return;
      }
      const parsed = metricsFromLighthouseJson(result.raw);
      setCwvPagespeed(cwvReportFromLighthouseJson(result.raw, "ingest"));
      if (cwvTbtMs === null) setCwvTbtMs(parsed.tbtMs);
      setLastRunAt(Date.now());
    } catch (err: unknown) {
      setPagespeedError(err instanceof Error ? err.message : String(err));
    } finally {
      setPagespeedBusy(false);
    }
  };

  const metricFor = (
    report: CwvReport | null,
    id: string,
  ): CwvMetric | undefined => report?.metrics.find((m) => m.id === id);

  /**
   * Open the Blast Radius screen for a file. The shared navigation prop only
   * carries an `AppView` (no target payload), so we stash the intended target
   * locally for a future Blast screen to consume, then navigate. See summary
   * for the host/contract gap.
   */
  const openBlastFor = (path: string): void => {
    if (path) {
      writeStore("prism:blast:pending-target", {
        kind: "file",
        id: path,
        path,
        at: Date.now(),
        returnView: "domain",
        domainId: props.domainId,
      });
    }
    props.onNavigate("blast");
  };

  /**
   * Trigger a GitHub Actions workflow_dispatch / repository_dispatch.
   * Uses numeric workflow id when known; falls back to basename. Owner/repo
   * come from the card (primary Integrations or an added remote).
   */
  const dispatchWorkflow = async (
    event: { readonly currentTarget: HTMLFormElement; preventDefault(): void },
    workflowPath: string,
    nodeId: string,
    kind: "workflow_dispatch" | "repository_dispatch",
    opts?: {
      owner?: string;
      repo?: string;
      token?: string;
      workflowId?: number;
      workflows?: readonly GithubWorkflowSummary[];
    },
  ): Promise<void> => {
    event.preventDefault();
    const owner = (opts?.owner ?? primaryOwner).trim();
    const repo = (opts?.repo ?? primaryRepo).trim();
    const token = (opts?.token ?? githubToken).trim();
    if (!owner || !repo) {
      setWfResult({
        id: nodeId,
        ok: false,
        msg: "Configure GitHub owner/repo under Integrations.",
      });
      return;
    }
    if (primaryRepoPrivate === true && !token && !opts?.token) {
      setWfResult({
        id: nodeId,
        ok: false,
        msg: "Private repo — add a GitHub token under Integrations to dispatch.",
      });
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const preferredRef = (props.branch ?? "main").trim() || "main";
    const workflows = opts?.workflows ?? remoteWorkflows;
    const workflowId =
      opts?.workflowId ?? matchRemoteWorkflowId(workflowPath, workflows);
    setWfBusy(nodeId);
    setWfResult(null);
    try {
      if (kind === "workflow_dispatch") {
        const inputs: Record<string, string> = {};
        for (const [k, v] of data.entries()) {
          if (typeof v === "string" && v !== "") inputs[k] = v;
        }
        const result = await dispatchGithubWorkflow({
          owner,
          repo,
          ...(token ? { token } : {}),
          kind: "workflow_dispatch",
          ...(workflowId !== undefined ? { workflowId } : {}),
          workflowPath,
          ref: preferredRef,
          inputs,
        });
        if (!result.ok) {
          setWfResult({ id: nodeId, ok: false, msg: result.error });
          return;
        }
        setWfResult({
          id: nodeId,
          ok: true,
          msg: `Dispatched on ${result.ref}. Refreshing Active Pipelines…`,
        });
      } else {
        const eventType = String(data.get("__event_type") ?? "").trim();
        const result = await dispatchGithubWorkflow({
          owner,
          repo,
          ...(token ? { token } : {}),
          kind: "repository_dispatch",
          eventType: eventType || "prism-trigger",
        });
        if (!result.ok) {
          setWfResult({ id: nodeId, ok: false, msg: result.error });
          return;
        }
        setWfResult({
          id: nodeId,
          ok: true,
          msg: `Dispatched event on ${owner}/${repo}. Refreshing Active Pipelines…`,
        });
      }
      setGithubRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setWfResult({
        id: nodeId,
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWfBusy(null);
    }
  };

  const onTestAddConnection = async (): Promise<void> => {
    setAddError(null);
    setAddOk(null);
    const parsed = parseGithubRepoRef(addUrl);
    if (!parsed) {
      setAddError("Enter a GitHub URL or owner/repo.");
      return;
    }
    if (!networkAllowed || !githubEnabled) {
      setAddError(
        "Enable Integrations · GitHub and Settings → Allow network integrations first.",
      );
      return;
    }
    setTestBusy(true);
    try {
      const token = githubToken.trim();
      const result = await testGithubRepoConnection({
        owner: parsed.owner,
        repo: parsed.repo,
        ...(token ? { token } : {}),
      });
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setAddOk(
        `Connected to ${result.repo.owner}/${result.repo.repo} (${result.workflows.length} workflow${result.workflows.length === 1 ? "" : "s"}, default branch ${result.repo.defaultBranch}).`,
      );
    } finally {
      setTestBusy(false);
    }
  };

  const onConfirmAddRepo = async (): Promise<void> => {
    setAddError(null);
    const parsed = parseGithubRepoRef(addUrl);
    if (!parsed) {
      setAddError("Enter a GitHub URL or owner/repo.");
      return;
    }
    if (
      parsed.owner.toLowerCase() === primaryOwner.toLowerCase() &&
      parsed.repo.toLowerCase() === primaryRepo.toLowerCase()
    ) {
      setAddError(
        "That repo is already the primary Integrations GitHub connection.",
      );
      return;
    }
    setAddBusy(true);
    try {
      const token = githubToken.trim() || undefined;
      const test = await testGithubRepoConnection({
        owner: parsed.owner,
        repo: parsed.repo,
        ...(token ? { token } : {}),
      });
      if (!test.ok) {
        setAddError(test.error);
        return;
      }
      const next = upsertRemoteRepo({
        owner: parsed.owner,
        repo: parsed.repo,
      });
      setExtraRepos(next);
      setAddModalOpen(false);
      setAddUrl("");
      setAddOk(null);
      await refreshExtraRepo({
        owner: parsed.owner,
        repo: parsed.repo,
      });
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
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
              <div className="dm-lab-menu" ref={topAnalyzeMenuRef}>
                <button
                  type="button"
                  className="ov-btn ov-btn--primary"
                  disabled={frontendBusy}
                  aria-expanded={topAnalyzeMenuOpen}
                  aria-haspopup="menu"
                  title={def.labNote}
                  onClick={() => {
                    setLabMenuOpen(null);
                    setTopAnalyzeMenuOpen((v) => !v);
                  }}
                >
                  {frontendBusy ? (
                    <Loader2 size={13} aria-hidden className="bw-spin" />
                  ) : (
                    <FlaskConical size={13} aria-hidden />
                  )}
                  {frontendBusy ? "Analyzing…" : "Analyze"}
                  <ChevronDown size={13} aria-hidden />
                </button>
                {topAnalyzeMenuOpen && !frontendBusy ? (
                  <div className="dm-lab-menu__pop" role="menu">
                    <button
                      type="button"
                      className="dm-lab-menu__item"
                      role="menuitem"
                      onClick={() => void runAnalyseEverything()}
                    >
                      <ListChecks size={14} aria-hidden />
                      Analyse Everything
                      <span className="dm-lab-menu__meta">lab + bundle</span>
                    </button>
                    <button
                      type="button"
                      className="dm-lab-menu__item"
                      role="menuitem"
                      onClick={() => {
                        setTopAnalyzeMenuOpen(false);
                        setCwvAccOpen(true);
                        void runLocalLab(frontendRoutes);
                      }}
                    >
                      <Activity size={14} aria-hidden />
                      Analyse CWV
                      <span className="dm-lab-menu__meta">
                        {frontendRoutes.length} routes
                      </span>
                    </button>
                    <button
                      type="button"
                      className="dm-lab-menu__item"
                      role="menuitem"
                      onClick={() => {
                        setTopAnalyzeMenuOpen(false);
                        setLhAccOpen(true);
                        void runLocalLab(frontendRoutes);
                      }}
                    >
                      <Monitor size={14} aria-hidden />
                      Analyse Lighthouse
                      <span className="dm-lab-menu__meta">
                        {frontendRoutes.length} routes
                      </span>
                    </button>
                    <button
                      type="button"
                      className="dm-lab-menu__item"
                      role="menuitem"
                      onClick={() => void runBundleAnalyzeFromPanel()}
                    >
                      <Boxes size={14} aria-hidden />
                      Analyse Bundle
                    </button>
                  </div>
                ) : null}
              </div>
            ) : status === "ready" && overlay && canRun ? (
              <button
                type="button"
                className="ov-btn ov-btn--primary"
                onClick={() => props.onRun(def.kind!)}
              >
                <RefreshCw size={13} aria-hidden />
                Analyze
              </button>
            ) : null}
          </div>
        </header>

        <div className="ov-scroll">
          {isFrontend ? (
            <>
              {lastRunAt !== null || labBusy ? (
                <div className="dm-runbar">
                  <span className="dm-runbar__dot" aria-hidden />
                  {labBusy
                    ? "Lab running… previous results cleared"
                    : `Last run ${relativeTime(lastRunAt!)}${
                        cwvLocal
                          ? ` · ${cwvLocal.source === "lab-fixture" ? "lab fixture" : cwvLocal.source}`
                          : ""
                      }`}
                  {!labBusy && (cwvLocal || cwvPagespeed) ? (
                    <span className="dm-runbar__tools">
                      <button
                        type="button"
                        className="dm-linkbtn"
                        onClick={() => importInputRef.current?.click()}
                      >
                        <Upload size={12} aria-hidden />
                        Import
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}

              {labFellBack && labError ? (
                <div className="dm-warnbar" role="status">
                  <AlertTriangle size={14} aria-hidden />
                  <span>{labError}</span>
                </div>
              ) : labError ? (
                <div className="dm-warnbar" role="status">
                  <AlertTriangle size={14} aria-hidden />
                  <span>{labError}</span>
                </div>
              ) : null}

              <section className="ov-card ts-acc" aria-label="Core Web Vitals">
                <div className="ts-acc__header">
                  <button
                    type="button"
                    className="ts-acc__trigger"
                    aria-expanded={cwvAccOpen}
                    onClick={() => setCwvAccOpen((v) => !v)}
                  >
                    <span className="ts-acc__chevron" aria-hidden>
                      {cwvAccOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </span>
                    <h2 className="ts-head__title">
                      <CardIcon icon={Activity} tone="brand" size={18} />
                      Core Web Vitals
                      <InfoTip label="Core Web Vitals">
                        Lab or imported Lighthouse metrics (LCP, INP, CLS, FCP,
                        TTFB). Prism never fabricates field data — numbers come
                        from a local lab run, imported JSON, or opt-in
                        PageSpeed.
                      </InfoTip>
                    </h2>
                  </button>
                  <div className="ts-acc__actions">
                    <div className="cwv__settings" ref={cwvSettingsRef}>
                      <button
                        type="button"
                        className="dm-iconbtn"
                        aria-label="CWV source settings"
                        aria-expanded={cwvSettingsOpen}
                        title="CWV source settings"
                        onClick={() => setCwvSettingsOpen((v) => !v)}
                      >
                        <Settings size={15} aria-hidden />
                      </button>
                      {cwvSettingsOpen ? (
                        <div
                          className="dm-popover"
                          role="dialog"
                          aria-label="CWV source"
                        >
                          <div className="dm-popover__h">CWV source</div>
                          <Select
                            aria-label="CWV data source"
                            value={cwvSource}
                            onChange={(v) => setCwvSource(v as CwvSource)}
                            options={[
                              { value: "local", label: "Local lab / import" },
                              {
                                value: "pagespeed",
                                label: "PageSpeed Insights",
                              },
                            ]}
                          />
                          <p className="dm-popover__note">
                            {pagespeedEnabled
                              ? "PageSpeed runs a network fetch only when selected."
                              : "PageSpeed needs an API key in Integrations + network enabled in Settings."}
                          </p>
                          {!pagespeedEnabled ? (
                            <button
                              type="button"
                              className="ov-btn ov-btn--ghost dm-popover__link"
                              onClick={() => props.onNavigate("integrations")}
                            >
                              <ExternalLink size={13} aria-hidden />
                              Open Integrations
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {renderRouteAnalyzeMenu("cwv", cwvLabMenuRef)}
                  </div>
                </div>

                {cwvAccOpen ? (
                  <div className="ts-acc__body">
                    <div className="cwv__grid">
                      {CWV_METRICS.map((m) => {
                        const local = metricFor(cwvLocal, m.id);
                        const remote = metricFor(cwvPagespeed, m.id);
                        const primary =
                          cwvSource === "pagespeed"
                            ? (remote ?? local)
                            : (local ?? remote);
                        const tbtFallback =
                          m.id === "INP" &&
                          !primary &&
                          cwvTbtMs !== null &&
                          cwvSource !== "pagespeed";
                        const displayRating = tbtFallback
                          ? scoreRating(
                              cwvTbtMs! <= 200
                                ? 1
                                : cwvTbtMs! <= 600
                                  ? 0.6
                                  : 0.3,
                            )
                          : primary?.rating;
                        const displayValue = tbtFallback
                          ? cwvTbtMs! >= 1000
                            ? `${(cwvTbtMs! / 1000).toFixed(2)}s`
                            : `${Math.round(cwvTbtMs!)}ms`
                          : primary
                            ? formatCwvValue(primary)
                            : "—";
                        return (
                          <article
                            key={m.id}
                            className={`cwv-tile${insightFilter === m.id ? " cwv-tile--active" : ""}`}
                            title={m.name}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setInsightFilter((cur) =>
                                cur === m.id ? null : m.id,
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setInsightFilter((cur) =>
                                  cur === m.id ? null : m.id,
                                );
                              }
                            }}
                          >
                            <div className="cwv-tile__head">
                              <span className="cwv-tile__k">
                                {m.id}
                                <InfoTip label={m.name}>
                                  {m.desc} Good {m.goodLabel}; poor{" "}
                                  {m.poorLabel}.
                                  {m.id === "INP"
                                    ? " Lab runs often omit INP (needs real interactions); TBT is shown as a lab proxy when available."
                                    : ""}
                                </InfoTip>
                              </span>
                              <span
                                className={`cwv-tile__badge ${ratingClass(displayRating)}`}
                              >
                                {tbtFallback
                                  ? "Lab proxy"
                                  : ratingLabel(displayRating)}
                              </span>
                            </div>
                            <div
                              className={`cwv-tile__v ${ratingClass(displayRating)}`}
                            >
                              {displayValue}
                            </div>
                            {tbtFallback ? (
                              <div className="cwv-tile__hint">
                                TBT (lab proxy · not field INP)
                              </div>
                            ) : local && remote ? (
                              <div className="cwv-tile__hint">
                                Local {formatCwvValue(local)} · PageSpeed{" "}
                                {formatCwvValue(remote)}
                              </div>
                            ) : (
                              <div className="cwv-tile__hint">
                                Good {m.goodLabel} · Poor {m.poorLabel}
                              </div>
                            )}
                            <div className="cwv-tile__band" aria-hidden>
                              <span className="cwv-tile__seg cwv-tile__seg--good" />
                              <span className="cwv-tile__seg cwv-tile__seg--warn" />
                              <span className="cwv-tile__seg cwv-tile__seg--poor" />
                            </div>
                          </article>
                        );
                      })}
                      {cwvTbtMs !== null &&
                      metricFor(cwvPrimaryReport, "INP") ? (
                        <article
                          className="cwv-tile"
                          title="Total Blocking Time"
                        >
                          <div className="cwv-tile__head">
                            <span className="cwv-tile__k">
                              TBT
                              <InfoTip label="Total Blocking Time">
                                {TBT_DESC}
                              </InfoTip>
                            </span>
                            <span
                              className={`cwv-tile__badge ${ratingClass(scoreRating(cwvTbtMs <= 200 ? 1 : cwvTbtMs <= 600 ? 0.6 : 0.3))}`}
                            >
                              Lab
                            </span>
                          </div>
                          <div className="cwv-tile__v">
                            {cwvTbtMs >= 1000
                              ? `${(cwvTbtMs / 1000).toFixed(2)}s`
                              : `${Math.round(cwvTbtMs)}ms`}
                          </div>
                          <div className="cwv-tile__hint">
                            From Lighthouse audit
                          </div>
                        </article>
                      ) : null}
                    </div>

                    <p className="cwv-trust">
                      Lab scores from local Chrome / Lighthouse — each run takes
                      the median of 3 mobile-simulated passes (more stable LCP).
                      Reliable for load triage (LCP, CLS, FCP, TTFB,
                      categories). Field INP / CrUX needs PageSpeed or real-user
                      data; lab INP is often empty and TBT is used as a proxy.
                    </p>

                    {(insightGroups.pain.length > 0 ||
                      insightGroups.improve.length > 0 ||
                      insightGroups.good.length > 0) && (
                      <div className="cwv-insights">
                        <div className="cwv-insights__h">
                          Metric breakdown
                          {insightFilter ? (
                            <button
                              type="button"
                              className="dm-linkbtn"
                              onClick={() => setInsightFilter(null)}
                            >
                              Clear {insightFilter} filter
                            </button>
                          ) : (
                            <span className="cwv-insights__hint">
                              Click a CWV tile to filter
                            </span>
                          )}
                        </div>
                        <div className="cwv-insights__grid">
                          {(
                            [
                              ["pain", "Pain areas", insightGroups.pain],
                              ["improve", "Needs work", insightGroups.improve],
                              ["good", "Good", insightGroups.good],
                            ] as const
                          ).map(([key, label, items]) => (
                            <div
                              key={key}
                              className={`cwv-insights__col cwv-insights__col--${key}`}
                            >
                              <div className="cwv-insights__col-h">
                                <span>{label}</span>
                                <span className="cwv-insights__count">
                                  {items.length}
                                </span>
                              </div>
                              {items.length === 0 ? (
                                <p className="dm-note">None in this band.</p>
                              ) : (
                                <ul className="cwv-insights__list">
                                  {items.slice(0, 8).map((i) => (
                                    <li
                                      key={i.id}
                                      className="cwv-insights__item"
                                    >
                                      {i.metricId ? (
                                        <span className="cwv-insights__metric">
                                          {i.metricId}
                                        </span>
                                      ) : null}
                                      <span className="cwv-insights__item-title">
                                        {i.title}
                                      </span>
                                      {i.detail ? (
                                        <span className="cwv-insights__item-detail">
                                          {i.detail}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <input
                      ref={importInputRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(e) => {
                        onImportCwv(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />

                    <div className="card-masonry">
                      {!cwvLocal &&
                      !cwvPagespeed &&
                      !labBusy &&
                      lastRunAt === null ? (
                        <article className="ov-card">
                          <div className="ov-card__head">
                            <span className="ov-card__title">
                              <CardIcon
                                icon={FlaskConical}
                                tone="brand"
                                size={14}
                              />
                              Local lab &amp; import
                              <InfoTip label="Local lab & import">
                                Runs a real local Lighthouse lab (requires
                                Chrome/Chromium and a locally served app).
                                Sample data is never shown — if the lab can’t
                                run, you’ll get steps to enable it, or you can
                                import a Lighthouse / PageSpeed JSON report /
                                use PageSpeed Insights.
                              </InfoTip>
                            </span>
                          </div>
                          <p className="dm-idle__desc" style={{ marginTop: 0 }}>
                            {def.description}
                          </p>
                          <div className="cwv-optin__actions">
                            <button
                              type="button"
                              className="ov-btn ov-btn--ghost"
                              onClick={() => importInputRef.current?.click()}
                            >
                              <Upload size={14} aria-hidden />
                              Import CWV report
                            </button>
                          </div>
                          <p className="dm-note dm-note--wrap">
                            In Chrome DevTools → Lighthouse → export JSON
                            report, or PageSpeed Insights → Download JSON, then
                            import here.
                          </p>
                          {labError ? (
                            <p className="dm-idle__err">{labError}</p>
                          ) : null}
                        </article>
                      ) : null}

                      {cwvSource === "pagespeed" ? (
                        <article className="ov-card">
                          <div className="ov-card__head">
                            <span className="ov-card__title">
                              <CardIcon
                                icon={Monitor}
                                tone="violet"
                                size={14}
                              />
                              PageSpeed Insights
                              <InfoTip label="PageSpeed Insights">
                                Opt-in network fetch when Integrations ·
                                PageSpeed has an API key and Settings allows
                                network integrations.
                              </InfoTip>
                            </span>
                            <span className="ov-card__meta">
                              {pagespeedEnabled ? "Connected" : "Off"}
                            </span>
                          </div>
                          {pagespeedEnabled ? (
                            <>
                              <label className="dm-pipe__field">
                                <span className="dm-pipe__field-k">URL</span>
                                <Input
                                  type="url"
                                  value={pagespeedUrl}
                                  onChange={(e) =>
                                    setPagespeedUrl(e.target.value)
                                  }
                                  placeholder="https://…"
                                  aria-label="PageSpeed URL"
                                />
                              </label>
                              <button
                                type="button"
                                className="ov-btn ov-btn--primary"
                                disabled={pagespeedBusy}
                                onClick={() => void fetchPagespeed()}
                              >
                                {pagespeedBusy
                                  ? "Fetching…"
                                  : "Fetch PageSpeed"}
                              </button>
                              {pagespeedError ? (
                                <p className="dm-idle__err">{pagespeedError}</p>
                              ) : null}
                              {cwvLocal && cwvPagespeed ? (
                                <p className="dm-note">
                                  Tiles above show local vs PageSpeed side by
                                  side when both are present.
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <p className="ov-empty">
                                Enable PageSpeed under Integrations and Allow
                                network integrations in Settings.
                              </p>
                              <button
                                type="button"
                                className="ov-btn ov-btn--ghost"
                                onClick={() => props.onNavigate("integrations")}
                              >
                                <ExternalLink size={13} aria-hidden />
                                Open Integrations
                              </button>
                            </>
                          )}
                        </article>
                      ) : null}
                    </div>

                    <div className="dm-routes">
                      <div className="dm-routes__head">
                        <span className="dm-routes__title">
                          <CardIcon icon={Layers} tone="brand" size={14} />
                          Routes &amp; components
                          <InfoTip label="Routes & components">
                            Routes are discovered from the workspace (React
                            Router, SEO catalogs, Next pages). Use Analyze on
                            Core Web Vitals or Lighthouse to measure all routes
                            or a selected subset. Soft 404 / not-found pages are
                            skipped. Each route card shows its own lab console
                            while measuring.
                          </InfoTip>
                        </span>
                        <span className="dm-routes__meta">
                          {routeBreakdown.filter((r) => r.measured).length}{" "}
                          measured · {routeBreakdown.length} listed
                        </span>
                      </div>
                      {labSelectMode ? (
                        <div
                          className="dm-route-select"
                          role="group"
                          aria-label="Select routes"
                        >
                          <div className="dm-route-select__head">
                            <span>
                              Select routes to measure (
                              {selectedLabRoutes.length} selected)
                            </span>
                            <div className="dm-route-select__actions">
                              <button
                                type="button"
                                className="dm-linkbtn"
                                onClick={() =>
                                  setSelectedLabRoutes([...frontendRoutes])
                                }
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                className="dm-linkbtn"
                                onClick={() => setSelectedLabRoutes([])}
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                className="dm-linkbtn"
                                onClick={() => setLabSelectMode(false)}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="ov-btn ov-btn--primary"
                                disabled={
                                  labBusy || selectedLabRoutes.length === 0
                                }
                                onClick={() =>
                                  void runLocalLab(selectedLabRoutes)
                                }
                              >
                                <Play size={13} aria-hidden />
                                Run selected
                              </button>
                            </div>
                          </div>
                          <div className="dm-route-select__list">
                            {frontendRoutes.map((route) => {
                              const checked = selectedLabRoutes.includes(route);
                              return (
                                <label
                                  key={`sel:${route}`}
                                  className="dm-route-select__row"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedLabRoutes((prev) =>
                                        checked
                                          ? prev.filter((r) => r !== route)
                                          : [...prev, route],
                                      );
                                    }}
                                  />
                                  <span className="ov-mono">{route}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {routeBreakdown.length > 0 ? (
                        <div className="dm-routes__grid">
                          {routeBreakdown.map((r) => {
                            const isMeasuring =
                              labBusy && labMeasuringRoute === r.route;
                            const isQueued =
                              labBusy &&
                              !r.measured &&
                              !isMeasuring &&
                              cwvLocal !== null;
                            const logs = routeLabLogs[r.route] ?? [];
                            return (
                              <article
                                key={r.route}
                                className={`dm-route-card${r.measured ? " dm-route-card--measured" : ""}${isMeasuring ? " dm-route-card--measuring" : ""}`}
                              >
                                <div className="dm-route-card__head">
                                  <span className="dm-route-card__path ov-mono">
                                    {r.route}
                                    {isMeasuring ? (
                                      <span className="dm-rank__tag dm-rank__tag--live">
                                        {" "}
                                        measuring…
                                      </span>
                                    ) : r.measured ? (
                                      <span className="dm-rank__tag">
                                        {" "}
                                        measured
                                      </span>
                                    ) : isQueued ? (
                                      <span className="dm-rank__tag dm-rank__tag--muted">
                                        {" "}
                                        queued
                                      </span>
                                    ) : (
                                      <span className="dm-rank__tag dm-rank__tag--muted">
                                        {" "}
                                        not measured
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`dm-rank__pill ${isMeasuring ? "dm-rating--live" : ratingClass(r.rating)}`}
                                  >
                                    {isMeasuring
                                      ? "Running"
                                      : r.measured
                                        ? ratingLabel(r.rating)
                                        : "—"}
                                  </span>
                                </div>
                                {isMeasuring && r.metrics.length === 0 ? (
                                  <p className="dm-route__empty dm-route__empty--live">
                                    Lighthouse is scoring this route…
                                  </p>
                                ) : r.metrics.length > 0 ? (
                                  <div className="dm-route__cwv">
                                    {CWV_METRICS.map((meta) => {
                                      const m = r.metrics.find(
                                        (x) => x.id === meta.id,
                                      );
                                      if (!m) return null;
                                      return (
                                        <article
                                          key={`${r.route}:${meta.id}`}
                                          className="cwv-tile cwv-tile--compact"
                                          title={meta.name}
                                        >
                                          <div className="cwv-tile__head">
                                            <span className="cwv-tile__k">
                                              {meta.id}
                                            </span>
                                            <span
                                              className={`cwv-tile__badge ${ratingClass(m.rating)}`}
                                            >
                                              {ratingLabel(m.rating)}
                                            </span>
                                          </div>
                                          <div
                                            className={`cwv-tile__v ${ratingClass(m.rating)}`}
                                          >
                                            {formatCwvValue(m)}
                                          </div>
                                          <div className="cwv-tile__hint">
                                            Good {meta.goodLabel} · Poor{" "}
                                            {meta.poorLabel}
                                          </div>
                                          <div
                                            className="cwv-tile__band"
                                            aria-hidden
                                          >
                                            <span className="cwv-tile__seg cwv-tile__seg--good" />
                                            <span className="cwv-tile__seg cwv-tile__seg--warn" />
                                            <span className="cwv-tile__seg cwv-tile__seg--poor" />
                                          </div>
                                        </article>
                                      );
                                    })}
                                    {/* Any non-CWV metrics (e.g. TBT) still surface as tiles */}
                                    {r.metrics
                                      .filter(
                                        (m) =>
                                          !CWV_METRICS.some(
                                            (meta) => meta.id === m.id,
                                          ),
                                      )
                                      .map((m) => (
                                        <article
                                          key={`${r.route}:${m.id}`}
                                          className="cwv-tile cwv-tile--compact"
                                          title={m.id}
                                        >
                                          <div className="cwv-tile__head">
                                            <span className="cwv-tile__k">
                                              {m.id}
                                            </span>
                                            <span
                                              className={`cwv-tile__badge ${ratingClass(m.rating)}`}
                                            >
                                              {ratingLabel(m.rating)}
                                            </span>
                                          </div>
                                          <div
                                            className={`cwv-tile__v ${ratingClass(m.rating)}`}
                                          >
                                            {formatCwvValue(m)}
                                          </div>
                                          <div
                                            className="cwv-tile__band"
                                            aria-hidden
                                          >
                                            <span className="cwv-tile__seg cwv-tile__seg--good" />
                                            <span className="cwv-tile__seg cwv-tile__seg--warn" />
                                            <span className="cwv-tile__seg cwv-tile__seg--poor" />
                                          </div>
                                        </article>
                                      ))}
                                  </div>
                                ) : (
                                  <p className="dm-route__empty">
                                    {r.measured
                                      ? "Sampled — no per-metric rollup"
                                      : isQueued
                                        ? "Waiting in queue — will measure after the current route finishes."
                                        : "Not measured in this lab run. Use Analyze → selected routes to include it, or all routes."}
                                  </p>
                                )}
                                {r.notes.length > 0 ? (
                                  <ul className="dm-route__notes">
                                    {r.notes.map((note) => (
                                      <li key={note} title={note}>
                                        {note}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                {logs.length > 0 || isMeasuring ? (
                                  <details
                                    className="dm-route__console"
                                    open={isMeasuring}
                                  >
                                    <summary>
                                      Lab console
                                      {isMeasuring
                                        ? " · running"
                                        : ` · ${logs.length} lines`}
                                    </summary>
                                    <pre className="dm-route__console-log">
                                      {logs.length > 0
                                        ? logs.join("\n")
                                        : "Waiting for Lighthouse output…"}
                                    </pre>
                                  </details>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No routes discovered yet — open the workspace and
                          ensure the frontend app is indexed.
                        </p>
                      )}
                      {componentBreakdown.length > 0 ? (
                        <>
                          <div className="dm-subhead">Components</div>
                          <div className="dm-rank">
                            {componentBreakdown.map((c) => (
                              <div key={`c:${c.key}`} className="dm-rank__row">
                                <div className="dm-rank__main">
                                  <span className="dm-rank__name ov-ellipsis">
                                    {c.key}
                                  </span>
                                  <span className="dm-rank__path">
                                    {c.metrics.length > 0
                                      ? c.metrics
                                          .slice(0, 3)
                                          .map(
                                            (m) =>
                                              `${m.id} ${formatCwvValue(m)}`,
                                          )
                                          .join(" · ")
                                      : "Component"}
                                  </span>
                                </div>
                                <span className="dm-rank__val ov-mono">
                                  {c.sampleCount > 0
                                    ? `${c.sampleCount}×`
                                    : "attr"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="dm-note">
                          Component-level attribution appears when the report
                          includes component rollups or attributions (e.g.
                          fixture / PageSpeed). Lab runs show element selectors
                          on each route card and under Metric breakdown.
                        </p>
                      )}
                    </div>

                    <p className="dm-foot">
                      Core Web Vitals are field/lab measurements — Prism never
                      fabricates them. Numbers appear here after a local
                      Lighthouse run or an imported CWV report.
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="ov-card ts-acc" aria-label="Lighthouse">
                <div className="ts-acc__header">
                  <button
                    type="button"
                    className="ts-acc__trigger"
                    aria-expanded={lhAccOpen}
                    onClick={() => setLhAccOpen((v) => !v)}
                  >
                    <span className="ts-acc__chevron" aria-hidden>
                      {lhAccOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </span>
                    <h2 className="ts-head__title">
                      <CardIcon icon={Monitor} tone="violet" size={18} />
                      Lighthouse
                      <InfoTip label="Lighthouse">
                        Category scores (0–100) from the Lighthouse report —
                        performance, accessibility, best practices, and SEO.
                        Uses the same local lab as Core Web Vitals.
                      </InfoTip>
                    </h2>
                  </button>
                  <div className="ts-acc__actions">
                    {renderRouteAnalyzeMenu("lh", lhLabMenuRef)}
                  </div>
                </div>

                {lhAccOpen ? (
                  <div className="ts-acc__body">
                    {frontendCategories.length > 0 ? (
                      <div className="dm-cats" style={{ marginTop: 0 }}>
                        <div className="dm-cats__grid">
                          {frontendCategories.map((c) => {
                            const rating = scoreRating(c.score);
                            return (
                              <article key={c.id} className="dm-cat">
                                <div className="dm-cat__k">
                                  {c.label}
                                  <InfoTip label={c.label}>{c.desc}</InfoTip>
                                </div>
                                <div
                                  className={`dm-cat__v ${ratingClass(rating)}`}
                                >
                                  {Math.round((c.score ?? 0) * 100)}
                                </div>
                                <div className="dm-cat__bar" aria-hidden>
                                  <span
                                    className={`dm-cat__fill ${ratingClass(rating)}`}
                                    style={{
                                      width: `${(c.score ?? 0) * 100}%`,
                                    }}
                                  />
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="ts-empty">
                        No Lighthouse category scores yet. Use Analyze to run a
                        local lab (same run also fills Core Web Vitals).
                      </p>
                    )}
                  </div>
                ) : null}
              </section>

              <section className="ov-card ts-acc" aria-label="Bundle Weight">
                <div className="ts-acc__header">
                  <button
                    type="button"
                    className="ts-acc__trigger"
                    aria-expanded={bundleAccOpen}
                    onClick={() => setBundleAccOpen((v) => !v)}
                  >
                    <span className="ts-acc__chevron" aria-hidden>
                      {bundleAccOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </span>
                    <h2 className="ts-head__title">
                      <CardIcon icon={Boxes} tone="amber" size={18} />
                      Bundle / Weight
                      <InfoTip label="Bundle Weight">
                        Real bundler stats from a local Analyze run (project
                        analyze script when present, else Prism-managed for Next
                        / Vite / Webpack). Prism never invents production sizes
                        from the import graph.
                      </InfoTip>
                    </h2>
                  </button>
                  <div className="ts-acc__actions">
                    <button
                      type="button"
                      className="ov-btn ov-btn--primary"
                      disabled={frontendBusy}
                      title="Run Bundle Analyze for the selected package"
                      onClick={() => void runBundleAnalyzeFromPanel()}
                    >
                      {bundleBusy ? (
                        <Loader2 size={13} aria-hidden className="bw-spin" />
                      ) : (
                        <Package size={13} aria-hidden />
                      )}
                      {bundleBusy ? "Analyzing…" : "Analyze"}
                    </button>
                  </div>
                </div>

                <div className="ts-acc__body" hidden={!bundleAccOpen}>
                  <BundleWeightPanel
                    ref={bundlePanelRef}
                    repoLabel={props.repoLabel}
                    embedded
                  />
                </div>
              </section>
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
                    Analyze
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
                Last run {relativeTime(lastRunAt ?? overlay.generatedAt)} ·{" "}
                {overlay.summary}
                {isDevops ? (
                  <span className="dm-runbar__tools">
                    <button
                      type="button"
                      className="ov-btn ov-btn--secondary"
                      onClick={() => {
                        setAddModalOpen(true);
                        setAddError(null);
                        setAddOk(null);
                      }}
                      disabled={!githubEnabled}
                      title={
                        githubEnabled
                          ? "Add CI from another GitHub repository"
                          : "Connect GitHub + allow network first"
                      }
                    >
                      <Plus size={12} aria-hidden />
                      Add Workflow from different Repo
                    </button>
                  </span>
                ) : null}
              </div>

              <section className="ov-kpis">
                {tiles.map((t) => (
                  <article key={t.label} className="ov-stat">
                    <div className="ov-stat__head">
                      <span className="ov-stat__k">
                        {t.label}
                        {t.tip ? (
                          <InfoTip label={t.label}>{t.tip}</InfoTip>
                        ) : null}
                      </span>
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
                      <InfoTip label={def.surfaceLabel}>
                        Nodes detected by the {def.kind ?? "domain"} overlay
                        from {def.sources}.
                      </InfoTip>
                    </span>
                    <SearchableInput
                      className="dm-filter-search"
                      value={filter}
                      onChange={setFilter}
                      placeholder={
                        enriched ? "Filter routes or files…" : "Filter…"
                      }
                      spellCheck={false}
                      aria-label={
                        enriched
                          ? "Filter routes and detected nodes"
                          : "Filter detected nodes"
                      }
                    />
                  </div>
                  {surfaceRows.length > 0 ? (
                    <div
                      className={`dm-surface${isMobile ? " dm-surface--mobile" : ""}${enriched ? " dm-surface--blast" : ""}`}
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
                            {enriched ? (
                              <span className="dm-surface__impact-h">
                                Impact
                              </span>
                            ) : null}
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
                                    {isDesktop
                                      ? shortProcessLabel(n.label, n.kind, path)
                                      : n.label}
                                  </span>
                                  <span
                                    className="dm-surface__path ov-mono ov-ellipsis"
                                    title={path}
                                  >
                                    {path || "—"}
                                  </span>
                                  {enriched ? (
                                    <button
                                      type="button"
                                      className="dm-blastbtn"
                                      aria-label={`Open Blast Radius for ${path || n.label}`}
                                      title="Open Blast Radius for this file"
                                      disabled={!path}
                                      onClick={() => openBlastFor(path)}
                                    >
                                      <Flame size={13} aria-hidden />
                                    </button>
                                  ) : null}
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
                      <InfoTip label="Composition">
                        Breakdown of detected node kinds in this overlay run.
                      </InfoTip>
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
                      <InfoTip label="Findings">
                        Heuristic callouts from this overlay (e.g. workflows
                        missing concurrency or permissions). Empty means no
                        automated findings — not a deep audit pass.
                      </InfoTip>
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
                      No automated findings for this overlay run
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
                          <InfoTip label="Navigators">
                            Navigator/Router files that compose screens (Expo
                            _layout, React Navigation Navigator.*).
                          </InfoTip>
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
                          <InfoTip label="Most Depended-on Screens">
                            Screens with highest inbound dependency edges from
                            the file graph.
                          </InfoTip>
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
                        In-degree from the file dependency graph.
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
                          <InfoTip label="Navigation Topology">
                            Real navigates edges from React Navigation / Expo
                            Router parsing, or screens that share a navigator
                            parent folder when explicit links are limited.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">
                          {mobileNavLinks.length}
                        </span>
                      </div>
                      {mobileNavLinks.length > 0 ? (
                        <div className="dm-rank">
                          {mobileNavLinks.slice(0, 16).map((l) => (
                            <div key={l.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {l.fromLabel} → {l.toLabel}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {kindLabel(l.fromKind || "node")} →{" "}
                                  {kindLabel(l.toKind || "node")}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                navigates
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No navigates edges yet — re-run analysis after adding
                          Expo Router links, Stack.Screen registrations, or
                          Screen imports.
                        </p>
                      )}
                      <p className="dm-note">
                        Platform (iOS/Android) and Deep Link details are not
                        available yet.
                      </p>
                    </article>
                  </>
                ) : null}

                {isDesktop ? (
                  <>
                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Sparkles
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Desktop Stack
                          <InfoTip label="Desktop Stack">
                            Electron / Tauri frameworks and stack DNA signals
                            for this workspace.
                          </InfoTip>
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
                          <Network
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Boundary Links
                          <InfoTip label="Boundary Links">
                            Structural edges from desktop-boundary (ipc /
                            exposes / loads) between main, preload, and
                            renderer.
                          </InfoTip>
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
                          {kindCount("main") +
                            kindCount("preload") +
                            kindCount("renderer") <
                          2
                            ? "Need at least two of main / preload / renderer process files to infer boundary links."
                            : "Process files detected, but no ipc/exposes/loads edges were inferred — check entry filenames (main.ts, preload.ts, renderer)."}
                        </p>
                      )}
                      <p className="dm-note">
                        Structural edges only — not per-channel IPC.
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
                          <InfoTip label="IPC Channels">
                            Channel names from ipcMain.handle /
                            ipcRenderer.invoke /
                            contextBridge.exposeInMainWorld. Preload exposure is
                            risk medium.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">
                          {desktopIpcChannels.length}
                        </span>
                      </div>
                      {desktopIpcChannels.length > 0 ? (
                        <div className="dm-rank">
                          {desktopIpcChannels.map((c) => (
                            <div
                              key={`${c.source}:${c.name}:${c.path}`}
                              className="dm-rank__row"
                            >
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-mono ov-ellipsis">
                                  {c.name}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {c.source} ·{" "}
                                  {c.path.split("/").pop() ?? c.path}
                                </span>
                              </div>
                              <span
                                className={`dm-tag${
                                  c.risk === "medium" ? " dm-tag--warn" : ""
                                }`}
                              >
                                {c.risk}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No ipcMain / ipcRenderer / contextBridge channel names
                          parsed yet.
                        </p>
                      )}
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
                          <InfoTip label="Process Churn Hotspots">
                            Desktop boundary files with the most recent git
                            commits.
                          </InfoTip>
                        </span>
                      </div>
                      {desktopChurn.length > 0 ? (
                        <div className="dm-rank">
                          {desktopChurn.map(({ node: n, file }) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {shortProcessLabel(
                                    n.label,
                                    n.kind,
                                    nodePath(n.attrs),
                                  )}
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
                          <InfoTip label="Most Depended-on Process Files">
                            Process / IPC files with highest inbound dependency
                            edges.
                          </InfoTip>
                        </span>
                      </div>
                      {desktopMostDepended.length > 0 ? (
                        <div className="dm-rank">
                          {desktopMostDepended.map(({ node: n, deps }) => (
                            <div key={n.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {shortProcessLabel(
                                    n.label,
                                    n.kind,
                                    nodePath(n.attrs),
                                  )}
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
                          No inbound dependencies found for process files.
                        </p>
                      )}
                      <p className="dm-note">
                        In-degree from the file dependency graph.
                      </p>
                    </article>
                  </>
                ) : null}

                {isDevops ? (
                  <>
                    <article className="ov-card card-span-all dm-ci-board">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Workflow
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Pipelines by repo
                          <InfoTip label="Pipelines by repo">
                            Each accordion is one GitHub repo: Active Pipelines
                            (live runs) plus CI/CD workflows and triggers.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">
                          {1 +
                            extraRepos.filter(
                              (r) =>
                                !(
                                  r.owner.toLowerCase() ===
                                    primaryOwner.toLowerCase() &&
                                  r.repo.toLowerCase() ===
                                    primaryRepo.toLowerCase()
                                ),
                            ).length}{" "}
                          repo
                          {1 +
                            extraRepos.filter(
                              (r) =>
                                !(
                                  r.owner.toLowerCase() ===
                                    primaryOwner.toLowerCase() &&
                                  r.repo.toLowerCase() ===
                                    primaryRepo.toLowerCase()
                                ),
                            ).length ===
                          1
                            ? ""
                            : "s"}
                        </span>
                      </div>
                      <div className="dm-ci-columns">
                        <details open className="dm-ci-accord">
                          <summary className="dm-ci-accord__summary">
                            <span className="dm-ci-accord__title ov-ellipsis">
                              {primaryOwner && primaryRepo
                                ? `${primaryOwner}/${primaryRepo}`
                                : props.repoLabel || "Current repo"}
                            </span>
                            <span className="dm-ci-accord__meta">
                              {filteredRuns.length} run
                              {filteredRuns.length === 1 ? "" : "s"} ·{" "}
                              {ciNodes.length} workflow
                              {ciNodes.length === 1 ? "" : "s"}
                            </span>
                          </summary>
                          <div className="dm-ci-accord__body dm-ci-accord__split">
                            <section className="dm-ci-section">
                              <h3 className="dm-ci-section__title">
                                <Activity size={13} aria-hidden />
                                Active Pipelines
                              </h3>
                              {githubEnabled ? (
                                <>
                                  <div className="dm-pipe__filter">
                                    <ToggleGroup
                                      aria-label="Pipeline filter"
                                      options={[
                                        { id: "all", label: "All runs" },
                                        { id: "mine", label: "My triggered" },
                                      ]}
                                      value={myTriggeredOnly ? "mine" : "all"}
                                      onChange={(id) =>
                                        setMyTriggeredOnly(id === "mine")
                                      }
                                    />
                                  </div>
                                  {githubError ? (
                                    <p className="dm-idle__err">
                                      {githubError}
                                    </p>
                                  ) : null}
                                  {filteredRuns.length > 0 ? (
                                    <PipelineRunsTable
                                      runs={filteredRuns.slice(0, 24)}
                                    />
                                  ) : (
                                    <p className="ov-empty">
                                      {githubBusy
                                        ? "Fetching runs…"
                                        : myTriggeredOnly
                                          ? "No runs match the My triggered filter."
                                          : "No recent workflow runs returned."}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <div className="dm-active">
                                  <Plug size={18} aria-hidden />
                                  <div>
                                    <p className="dm-active__title">
                                      Live runs need GitHub + network
                                    </p>
                                    <p className="dm-active__body">
                                      Enable Integrations · GitHub and Settings
                                      → Allow network integrations.
                                    </p>
                                    <button
                                      type="button"
                                      className="ov-btn ov-btn--ghost dm-active__cta"
                                      onClick={() =>
                                        props.onNavigate("integrations")
                                      }
                                    >
                                      <ExternalLink size={13} aria-hidden />
                                      Open Integrations
                                    </button>
                                  </div>
                                </div>
                              )}
                            </section>

                            <section className="dm-ci-section">
                              <h3 className="dm-ci-section__title">
                                <Workflow size={13} aria-hidden />
                                CI/CD Pipelines
                              </h3>
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
                                  const canTrigger =
                                    n.attrs?.canTrigger === true;
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
                                  const repoLabel =
                                    typeof n.attrs?.repo === "string" &&
                                    n.attrs.repo
                                      ? String(n.attrs.repo)
                                      : props.repoLabel;
                                  return (
                                    <div key={n.id} className="dm-pipe">
                                      <div className="dm-pipe__head">
                                        <span className="dm-pipe__name ov-ellipsis">
                                          {n.label}
                                        </span>
                                        <span className="dm-pipe__prov">
                                          GitHub · {repoLabel}
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
                                          <span className="dm-pipe__k">
                                            jobs
                                          </span>
                                          <div className="dm-pipe__tags">
                                            {jobs.map((j) => (
                                              <span
                                                key={j}
                                                className="dm-pipe__job"
                                              >
                                                {j}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                      <div className="dm-pipe__trigger">
                                        {canTrigger && hasWorkflowDispatch ? (
                                          <form
                                            onSubmit={(e) =>
                                              void dispatchWorkflow(
                                                e,
                                                nodePath(n.attrs),
                                                n.id,
                                                "workflow_dispatch",
                                              )
                                            }
                                          >
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
                                                        name={inp.name}
                                                        disabled={
                                                          !triggersEnabled
                                                        }
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
                                                        name={inp.name}
                                                        disabled={
                                                          !triggersEnabled
                                                        }
                                                        defaultValue={
                                                          inp.default ?? ""
                                                        }
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
                                                No inputs declared — triggers
                                                as-is.
                                              </p>
                                            )}
                                            <button
                                              type="submit"
                                              className="ov-btn ov-btn--primary dm-pipe__run"
                                              disabled={
                                                !triggersEnabled ||
                                                wfBusy === n.id
                                              }
                                              title={
                                                triggersEnabled
                                                  ? "Dispatch this workflow on the current branch"
                                                  : primaryRepoPrivate ===
                                                        true && !githubToken
                                                    ? "Private repo — add a GitHub token under Integrations"
                                                    : "Connect GitHub under Integrations + allow network to trigger workflows"
                                              }
                                            >
                                              <Play size={13} aria-hidden />
                                              {wfBusy === n.id
                                                ? "Triggering…"
                                                : "Trigger workflow"}
                                            </button>
                                          </form>
                                        ) : null}
                                        {canTrigger && hasRepoDispatch ? (
                                          <form
                                            onSubmit={(e) =>
                                              void dispatchWorkflow(
                                                e,
                                                nodePath(n.attrs),
                                                n.id,
                                                "repository_dispatch",
                                              )
                                            }
                                          >
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
                                                  name="__event_type"
                                                  disabled={!triggersEnabled}
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
                                                Accepts repository_dispatch
                                                events (types not declared).
                                              </p>
                                            )}
                                            <button
                                              type="submit"
                                              className="ov-btn ov-btn--ghost dm-pipe__run"
                                              disabled={
                                                !triggersEnabled ||
                                                wfBusy === n.id
                                              }
                                              title={
                                                triggersEnabled
                                                  ? "Send a repository_dispatch event"
                                                  : "Connect GitHub under Integrations + allow network to dispatch events"
                                              }
                                            >
                                              <Play size={13} aria-hidden />
                                              {wfBusy === n.id
                                                ? "Dispatching…"
                                                : "Dispatch event"}
                                            </button>
                                          </form>
                                        ) : null}
                                        {canTrigger && wfResult?.id === n.id ? (
                                          <p
                                            className={
                                              wfResult.ok
                                                ? "dm-pipe__trigger-ok"
                                                : "dm-idle__err"
                                            }
                                          >
                                            {wfResult.msg}
                                          </p>
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
                                        {canTrigger && !triggersEnabled ? (
                                          <button
                                            type="button"
                                            className="dm-linkbtn"
                                            onClick={() =>
                                              props.onNavigate("integrations")
                                            }
                                          >
                                            <ExternalLink
                                              size={12}
                                              aria-hidden
                                            />
                                            {primaryRepoPrivate === true &&
                                            !githubToken
                                              ? "Add GitHub token in Integrations"
                                              : "Connect GitHub in Integrations"}
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}

                                {ciNodes.length === 0 ? (
                                  <p className="ov-empty">
                                    No CI/CD workflows detected under
                                    .github/workflows.
                                  </p>
                                ) : null}
                              </div>
                            </section>
                          </div>
                        </details>

                        {extraRepos
                          .filter(
                            (r) =>
                              !(
                                r.owner.toLowerCase() ===
                                  primaryOwner.toLowerCase() &&
                                r.repo.toLowerCase() ===
                                  primaryRepo.toLowerCase()
                              ),
                          )
                          .map((entry) => {
                            const key = `${entry.owner}/${entry.repo}`;
                            const state = extraCi[key];
                            const runs = state?.runs ?? [];
                            const filteredExtraRuns = myTriggeredOnly
                              ? githubActor
                                ? runs.filter(
                                    (r) =>
                                      r.actorLogin !== null &&
                                      r.actorLogin.toLowerCase() ===
                                        githubActor.toLowerCase(),
                                  )
                                : runs.filter(
                                    (r) => r.event === "workflow_dispatch",
                                  )
                              : runs;
                            const remoteCiNodes =
                              state?.overlay?.graph.nodes.filter(
                                (n) => n.kind === "ci",
                              ) ?? [];
                            const entryToken = (
                              entry.token ?? githubToken
                            ).trim();
                            const entryTriggers =
                              githubEnabled &&
                              (entryToken !== "" ||
                                primaryRepoPrivate !== true);
                            const wfCount =
                              remoteCiNodes.length > 0
                                ? remoteCiNodes.length
                                : (state?.workflows.length ?? 0);
                            return (
                              <details
                                key={`ci:${key}`}
                                open
                                className="dm-ci-accord"
                              >
                                <summary className="dm-ci-accord__summary">
                                  <span className="dm-ci-accord__title ov-ellipsis">
                                    {entry.owner}/{entry.repo}
                                  </span>
                                  <span className="dm-ci-accord__meta">
                                    {filteredExtraRuns.length} run
                                    {filteredExtraRuns.length === 1 ? "" : "s"}{" "}
                                    · {wfCount} workflow
                                    {wfCount === 1 ? "" : "s"}
                                  </span>
                                </summary>
                                <div className="dm-ci-accord__body dm-ci-accord__split">
                                  <div className="dm-ci-accord__actions">
                                    <button
                                      type="button"
                                      className="dm-linkbtn"
                                      onClick={() =>
                                        void refreshExtraRepo(entry)
                                      }
                                      disabled={state?.busy === true}
                                    >
                                      <RefreshCw size={12} aria-hidden />
                                      {state?.busy ? "Refreshing…" : "Refresh"}
                                    </button>
                                    <button
                                      type="button"
                                      className="dm-linkbtn"
                                      onClick={() =>
                                        setRemoveConfirm({
                                          owner: entry.owner,
                                          repo: entry.repo,
                                        })
                                      }
                                    >
                                      <X size={12} aria-hidden />
                                      Remove
                                    </button>
                                  </div>

                                  <section className="dm-ci-section">
                                    <h3 className="dm-ci-section__title">
                                      <Activity size={13} aria-hidden />
                                      Active Pipelines
                                    </h3>
                                    <div className="dm-pipe__filter">
                                      <ToggleGroup
                                        aria-label={`Pipeline filter · ${entry.owner}/${entry.repo}`}
                                        options={[
                                          { id: "all", label: "All runs" },
                                          {
                                            id: "mine",
                                            label: "My triggered",
                                          },
                                        ]}
                                        value={myTriggeredOnly ? "mine" : "all"}
                                        onChange={(id) =>
                                          setMyTriggeredOnly(id === "mine")
                                        }
                                      />
                                    </div>
                                    {state?.error ? (
                                      <p className="dm-idle__err">
                                        {state.error}
                                      </p>
                                    ) : null}
                                    {filteredExtraRuns.length > 0 ? (
                                      <PipelineRunsTable
                                        runs={filteredExtraRuns.slice(0, 24)}
                                      />
                                    ) : (
                                      <p className="ov-empty">
                                        {state?.busy
                                          ? "Fetching runs…"
                                          : myTriggeredOnly
                                            ? "No runs match the My triggered filter."
                                            : "No recent workflow runs returned."}
                                      </p>
                                    )}
                                  </section>

                                  <section className="dm-ci-section">
                                    <h3 className="dm-ci-section__title">
                                      <Workflow size={13} aria-hidden />
                                      CI/CD Pipelines
                                    </h3>
                                    <div className="dm-pipes">
                                      {remoteCiNodes.length > 0
                                        ? remoteCiNodes.map((n) => {
                                            const events = String(
                                              n.attrs?.events ?? "",
                                            )
                                              .split(",")
                                              .map((s) => s.trim())
                                              .filter(Boolean);
                                            const canTrigger =
                                              n.attrs?.canTrigger === true;
                                            const dispatchers = String(
                                              n.attrs?.dispatchers ?? "",
                                            )
                                              .split(",")
                                              .map((s) => s.trim())
                                              .filter(Boolean);
                                            const hasWorkflowDispatch =
                                              dispatchers.includes(
                                                "workflow_dispatch",
                                              );
                                            const path = nodePath(n.attrs);
                                            const wid = matchRemoteWorkflowId(
                                              path,
                                              state?.workflows ?? [],
                                            );
                                            return (
                                              <div
                                                key={`${key}:${n.id}`}
                                                className="dm-pipe"
                                              >
                                                <div className="dm-pipe__head">
                                                  <span className="dm-pipe__name ov-ellipsis">
                                                    {n.label}
                                                  </span>
                                                  <span className="dm-pipe__prov">
                                                    GitHub · {entry.owner}/
                                                    {entry.repo}
                                                  </span>
                                                </div>
                                                <span className="dm-pipe__file ov-mono ov-ellipsis">
                                                  {path}
                                                </span>
                                                {events.length > 0 ? (
                                                  <div className="dm-pipe__row">
                                                    <span className="dm-pipe__k">
                                                      on
                                                    </span>
                                                    <div className="dm-pipe__tags">
                                                      {events.map((e) => (
                                                        <span
                                                          key={e}
                                                          className="dm-pipe__ev"
                                                        >
                                                          {e}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  </div>
                                                ) : null}
                                                {canTrigger &&
                                                hasWorkflowDispatch ? (
                                                  <form
                                                    className="dm-pipe__trigger"
                                                    onSubmit={(e) =>
                                                      void dispatchWorkflow(
                                                        e,
                                                        path,
                                                        `${key}:${n.id}`,
                                                        "workflow_dispatch",
                                                        {
                                                          owner: entry.owner,
                                                          repo: entry.repo,
                                                          ...(entryToken
                                                            ? {
                                                                token:
                                                                  entryToken,
                                                              }
                                                            : {}),
                                                          ...(wid !== undefined
                                                            ? {
                                                                workflowId: wid,
                                                              }
                                                            : {}),
                                                          workflows:
                                                            state?.workflows ??
                                                            [],
                                                        },
                                                      )
                                                    }
                                                  >
                                                    <button
                                                      type="submit"
                                                      className="ov-btn ov-btn--primary dm-pipe__run"
                                                      disabled={
                                                        !entryTriggers ||
                                                        wfBusy ===
                                                          `${key}:${n.id}`
                                                      }
                                                    >
                                                      <Play
                                                        size={13}
                                                        aria-hidden
                                                      />
                                                      {wfBusy ===
                                                      `${key}:${n.id}`
                                                        ? "Triggering…"
                                                        : "Trigger workflow"}
                                                    </button>
                                                    {wfResult?.id ===
                                                    `${key}:${n.id}` ? (
                                                      <p
                                                        className={
                                                          wfResult.ok
                                                            ? "dm-pipe__trigger-ok"
                                                            : "dm-idle__err"
                                                        }
                                                      >
                                                        {wfResult.msg}
                                                      </p>
                                                    ) : null}
                                                  </form>
                                                ) : null}
                                              </div>
                                            );
                                          })
                                        : (state?.workflows ?? []).map((wf) => (
                                            <div
                                              key={`${key}:wf:${wf.id}`}
                                              className="dm-pipe"
                                            >
                                              <div className="dm-pipe__head">
                                                <span className="dm-pipe__name ov-ellipsis">
                                                  {wf.name}
                                                </span>
                                                <span className="dm-pipe__prov">
                                                  GitHub · {entry.owner}/
                                                  {entry.repo}
                                                </span>
                                              </div>
                                              <span className="dm-pipe__file ov-mono ov-ellipsis">
                                                {wf.path || wf.state}
                                              </span>
                                            </div>
                                          ))}
                                      {remoteCiNodes.length === 0 &&
                                      (state?.workflows.length ?? 0) === 0 ? (
                                        <p className="ov-empty">
                                          {state?.busy
                                            ? "Staging DevOps files…"
                                            : "No workflows staged yet."}
                                        </p>
                                      ) : null}
                                    </div>
                                  </section>
                                </div>
                              </details>
                            );
                          })}
                      </div>
                      <p className="dm-note">
                        One accordion per repo. Inside each: Active Pipelines
                        and CI/CD triggers sit together side-by-side.
                      </p>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Cloud
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Argo CD / Workflows
                          <InfoTip label="Argo">
                            Placeholder for now — live Argo sync and drift will
                            appear when the connector ships.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">Coming soon</span>
                      </div>
                      <p className="ov-empty">
                        Argo apps, sync status, and drift will appear here once
                        the Argo integration ships.
                      </p>
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost"
                        onClick={() => props.onNavigate("integrations")}
                      >
                        <ExternalLink size={13} aria-hidden />
                        Open Integrations
                      </button>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Server
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Jenkins
                          <InfoTip label="Jenkins">
                            Placeholder for now — job listing and last-build
                            status need the Jenkins connector.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">Coming soon</span>
                      </div>
                      <p className="ov-empty">
                        Jenkins jobs and build triggers will appear here once
                        the connector ships.
                      </p>
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost"
                        onClick={() => props.onNavigate("integrations")}
                      >
                        <ExternalLink size={13} aria-hidden />
                        Open Integrations
                      </button>
                    </article>
                  </>
                ) : null}

                {enriched ? (
                  <>
                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Server
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Routes
                          <InfoTip label="Routes">
                            HTTP endpoints from Core&apos;s backend report
                            (Express / Nest / Fastify). Handler prefers function
                            name when extractable.
                          </InfoTip>
                        </span>
                        <SearchableInput
                          className="dm-filter-search"
                          value={routeFilter}
                          onChange={setRouteFilter}
                          placeholder="Filter routes…"
                          spellCheck={false}
                          aria-label="Filter routes"
                        />
                      </div>
                      {props.backendReport && routeRows.length > 0 ? (
                        <div className="dm-surface dm-surface--routes dm-surface--routes-blast">
                          <div className="dm-surface__head">
                            <span>Method</span>
                            <span>Route</span>
                            <span>Auth</span>
                            <span>Test</span>
                            <span className="dm-surface__impact-h">Impact</span>
                          </div>
                          <div className="dm-surface__body">
                            {routeRows.map((e) => (
                              <div key={e.id} className="dm-surface__row">
                                <span className="dm-kind dm-route__method">
                                  {e.method}
                                </span>
                                <div className="dm-rank__main">
                                  <span className="dm-surface__name ov-mono ov-ellipsis">
                                    {e.path}
                                  </span>
                                  <span
                                    className="dm-surface__path ov-mono ov-ellipsis"
                                    title={e.handlerFile}
                                  >
                                    {e.handlerName
                                      ? `${e.handlerName} · ${e.handlerFile.split("/").pop()}`
                                      : e.handlerFile}
                                  </span>
                                </div>
                                <span
                                  className={`dm-tag${
                                    e.auth === "public" ? " dm-tag--warn" : ""
                                  }`}
                                >
                                  {e.auth}
                                </span>
                                <span
                                  className={`dm-surface__test${
                                    e.tested
                                      ? " dm-surface__test--ok"
                                      : " dm-surface__test--miss"
                                  }`}
                                >
                                  {e.tested ? "yes" : "no"}
                                </span>
                                <button
                                  type="button"
                                  className="dm-blastbtn"
                                  aria-label={`Open Blast Radius for ${e.handlerFile}`}
                                  title="Open Blast Radius for this handler file"
                                  disabled={!e.handlerFile}
                                  onClick={() => openBlastFor(e.handlerFile)}
                                >
                                  <Flame size={13} aria-hidden />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="ov-empty">
                          {props.backendReport
                            ? routeFilter.trim()
                              ? "No routes match the filter."
                              : "No Express / Nest / Fastify routes extracted."
                            : "Backend report unavailable — re-run analysis."}
                        </p>
                      )}
                      {props.backendReport?.summary ? (
                        <p className="dm-note">{props.backendReport.summary}</p>
                      ) : null}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <FlaskConical
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Endpoint Test Coverage
                          <InfoTip label="Endpoint Test Coverage">
                            Untested routes from Core&apos;s backend report —
                            stem match plus import edges when an index is
                            available.
                          </InfoTip>
                        </span>
                        <SearchableInput
                          className="dm-filter-search"
                          value={coverageFilter}
                          onChange={setCoverageFilter}
                          placeholder="Filter untested…"
                          spellCheck={false}
                          aria-label="Filter untested endpoints"
                        />
                      </div>
                      {coverage && coverage.total > 0 ? (
                        coverage.untested.length > 0 ? (
                          coverageRows.length > 0 ? (
                            <div className="dm-findings">
                              {coverageRows.map((e) => (
                                <div
                                  key={e.id}
                                  className="dm-finding"
                                  data-sev="medium"
                                >
                                  <div className="dm-finding__row">
                                    <FileWarning size={13} aria-hidden />
                                    <span className="dm-finding__msg ov-ellipsis">
                                      {e.method} {e.path}
                                      {e.handlerName
                                        ? ` (${e.handlerName})`
                                        : ""}
                                    </span>
                                    <span className="dm-tag dm-tag--warn">
                                      no test
                                    </span>
                                  </div>
                                  <span className="dm-finding__path ov-mono ov-ellipsis">
                                    {e.handlerFile}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="ov-empty">
                              No untested endpoints match the filter.
                            </p>
                          )
                        ) : (
                          <p className="ov-empty">
                            Every extracted route has linked test coverage.
                          </p>
                        )
                      ) : (
                        <p className="ov-empty">No endpoints to assess.</p>
                      )}
                      {coverage ? (
                        <p className="dm-note">
                          {coverage.tested}/{coverage.total} covered · from
                          Core&apos;s backend report.
                        </p>
                      ) : null}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <CardIcon icon={Database} tone="brand" size={14} />
                          Data Layer
                          <InfoTip label="Data Layer">
                            Models, migrations, SQL, and DB clients detected in
                            the workspace.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">
                          {props.backendReport?.dataLayer.length ?? 0}
                        </span>
                      </div>
                      <div className="dm-datalayer-grid">
                        {dataLayerGrid.map((d) => (
                          <div key={d.kind} className="dm-dl-card">
                            <CardIcon icon={d.icon} tone={d.tone} size={16} />
                            <span className="dm-dl-card__count ov-mono">
                              {d.count}
                            </span>
                            <span className="dm-dl-card__label">{d.label}</span>
                          </div>
                        ))}
                      </div>
                      {(props.backendReport?.dataLayer.length ?? 0) > 0 ? (
                        <div className="dm-rank">
                          {props
                            .backendReport!.dataLayer.slice(0, 12)
                            .map((d) => (
                              <div key={d.id} className="dm-rank__row">
                                <div className="dm-rank__main">
                                  <span className="dm-rank__name ov-ellipsis">
                                    {d.kind}
                                  </span>
                                  <span className="dm-rank__path ov-mono ov-ellipsis">
                                    {d.path}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No models, migrations, or DB clients detected.
                        </p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Plug
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Env &amp; Integrations
                          <InfoTip label="Env & Integrations">
                            Environment variables and third-party SDK usage
                            detected in source.
                          </InfoTip>
                        </span>
                      </div>
                      {(props.backendReport?.envVars.length ?? 0) > 0 ||
                      (props.backendReport?.integrations.length ?? 0) > 0 ? (
                        <div className="dm-split-sections">
                          <div className="dm-split-section">
                            <div className="dm-split-section__head">
                              <span>Environment</span>
                              <span className="ov-card__meta">
                                {props.backendReport?.envVars.length ?? 0}
                              </span>
                            </div>
                            {(props.backendReport?.envVars.length ?? 0) > 0 ? (
                              <div className="dm-rank">
                                {(props.backendReport?.envVars ?? [])
                                  .slice(0, 8)
                                  .map((v) => (
                                    <div
                                      key={`${v.name}:${v.path}`}
                                      className="dm-rank__row"
                                    >
                                      <div className="dm-rank__main">
                                        <span className="dm-rank__name ov-mono ov-ellipsis">
                                          {v.name}
                                        </span>
                                        <span className="dm-rank__path ov-mono ov-ellipsis">
                                          {v.path}
                                        </span>
                                      </div>
                                      <span className="dm-tag">env</span>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="ov-empty">No env vars detected.</p>
                            )}
                          </div>
                          <div className="dm-split-section">
                            <div className="dm-split-section__head">
                              <span>Integrations</span>
                              <span className="ov-card__meta">
                                {props.backendReport?.integrations.length ?? 0}
                              </span>
                            </div>
                            {(props.backendReport?.integrations.length ?? 0) >
                            0 ? (
                              <div className="dm-rank">
                                {(props.backendReport?.integrations ?? [])
                                  .slice(0, 8)
                                  .map((i) => (
                                    <div key={i.id} className="dm-rank__row">
                                      <div className="dm-rank__main">
                                        <span className="dm-rank__name ov-ellipsis">
                                          {i.name}
                                        </span>
                                        <span className="dm-rank__path ov-mono ov-ellipsis">
                                          {i.path ?? "—"}
                                        </span>
                                      </div>
                                      <span className="dm-tag">sdk</span>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="ov-empty">
                                No third-party SDKs detected.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="ov-empty">
                          No env vars or third-party SDKs detected.
                        </p>
                      )}
                    </article>

                    {(props.backendReport?.background.length ?? 0) > 0 ? (
                      <article className="ov-card">
                        <div className="ov-card__head">
                          <span className="ov-card__title">
                            <Workflow
                              size={14}
                              className="ov-card__icon"
                              aria-hidden
                            />
                            Background Work
                          </span>
                          <span className="ov-card__meta">
                            {props.backendReport!.background.length}
                          </span>
                        </div>
                        <div className="dm-rank">
                          {props.backendReport!.background.map((b) => (
                            <div key={b.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {b.kind}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {b.path}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ) : null}

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
                        In-degree from the file dependency graph.
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

      {addModalOpen ? (
        <div
          className="dna-modal-backdrop"
          role="presentation"
          onClick={() => setAddModalOpen(false)}
        >
          <div
            className="dna-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-add-repo-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dna-modal__head">
              <h2 id="dm-add-repo-title" className="dna-modal__title">
                Add Workflow from different Repo
              </h2>
              <button
                type="button"
                className="dna-modal__close"
                aria-label="Close"
                onClick={() => setAddModalOpen(false)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="dna-modal__note">
              Prism stages DevOps files (workflows, Docker, k8s/helm/deploy)
              under <span className="ov-mono">.prism/remote-ci/</span> and lists
              live Actions runs — no full index of the foreign repo. Uses the
              token from Integrations · GitHub when present.
            </p>
            <label className="dm-pipe__field">
              <span className="dm-pipe__field-k">
                Repository URL or owner/repo
              </span>
              <Input
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://github.com/org/repo or org/repo"
                aria-label="Repository URL"
              />
            </label>
            {addError ? <p className="dm-idle__err">{addError}</p> : null}
            {addOk ? <p className="dm-pipe__trigger-ok">{addOk}</p> : null}
            <div className="dna-modal__foot">
              <button
                type="button"
                className="ov-btn ov-btn--ghost"
                disabled={testBusy || addBusy}
                onClick={() => void onTestAddConnection()}
              >
                {testBusy ? "Testing…" : "Test connection"}
              </button>
              <button
                type="button"
                className="ov-btn ov-btn--primary"
                disabled={testBusy || addBusy}
                onClick={() => void onConfirmAddRepo()}
              >
                {addBusy ? "Adding…" : "Add repo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeConfirm ? (
        <div
          className="dna-modal-backdrop"
          role="presentation"
          onClick={() => setRemoveConfirm(null)}
        >
          <div
            className="dna-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dm-remove-repo-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dna-modal__head">
              <h2 id="dm-remove-repo-title" className="dna-modal__title">
                <AlertTriangle size={16} aria-hidden />
                Remove {removeConfirm.owner}/{removeConfirm.repo}?
              </h2>
              <button
                type="button"
                className="dna-modal__close"
                aria-label="Close"
                onClick={() => setRemoveConfirm(null)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="dna-modal__note">
              This removes the repo from DevOps Pipelines in this workspace.
              Live run listings stop, and staged files under{" "}
              <span className="ov-mono">.prism/remote-ci/</span> for this repo
              are no longer shown. You can add it again anytime.
            </p>
            <div className="dna-modal__foot">
              <button
                type="button"
                className="ov-btn ov-btn--ghost"
                onClick={() => setRemoveConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ov-btn ov-btn--danger"
                onClick={() => {
                  const { owner, repo } = removeConfirm;
                  const key = `${owner}/${repo}`;
                  const next = removeRemoteRepo(owner, repo);
                  setExtraRepos(next);
                  setExtraCi((prev) => {
                    const copy = { ...prev };
                    delete copy[key];
                    return copy;
                  });
                  setRemoveConfirm(null);
                }}
              >
                Remove repo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
