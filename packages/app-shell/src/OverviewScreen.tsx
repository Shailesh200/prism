import type {
  DnaReport,
  GitActivity,
  HealthScore,
  RepositoryMap,
  SecurityReport,
  TestingReport,
} from "@repo-prism/shared";
import {
  AreaChart,
  CardIcon,
  CartesianFrame,
  DateRangePicker,
  chartTipEdge,
  formatCompactCount,
  pickAxisIndices,
  relativeTime,
  type DateRangeValue,
  Text,
} from "@repo-prism/ui";
import {
  Activity,
  ArrowRight,
  Boxes,
  Clock,
  Coins,
  Dna,
  Download,
  FlaskConical,
  Layers,
  RefreshCw,
  Shield,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { AppSidebar, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { Avatar } from "./Avatar.js";
import { useAppShellClient } from "./client-context.js";
import { DOMAIN_CATALOG } from "./domain-catalog.js";
import { InfoTip } from "@repo-prism/ui";
import { isGitIntegrationEnabled } from "./integrations-store.js";
import { recordAudit } from "./audit-log.js";
import type { JobSummary } from "./jobs-types.js";
import {
  DEFAULT_JOB_RANGE,
  JOB_RANGE_PRESETS,
  jobMatchesRepo,
  jobRangeWindow,
} from "./jobs-range.js";
import {
  bucketActivity,
  buildReportMarkdown,
  couplingBadge as couplingBadgeFor,
  couplingDensity,
  couplingDensityPct,
  deriveMostConnected,
  deriveRegions,
  domainDisplayName,
  reportFilename,
  scoreColor,
  activityGeometry,
} from "./overview-model.js";
import { tokenUsageInRange } from "./token-activity.js";

/** Best-effort path from a commit subject when it names a repo file. */
function guessPathFromCommitMessage(
  message: string,
  map: RepositoryMap,
): string | null {
  const tokens = message.match(
    /[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|md|json|yml|yaml)/g,
  );
  if (!tokens) return null;
  const fileLabels = new Set(
    map.graph.nodes
      .filter((n) => n.kind === "file")
      .map((n) => n.label.replace(/\\/g, "/")),
  );
  for (const token of tokens) {
    const normalized = token.replace(/\\/g, "/");
    if (fileLabels.has(normalized)) return normalized;
    const hit = [...fileLabels].find(
      (p) => p.endsWith(`/${normalized}`) || p === normalized,
    );
    if (hit) return hit;
  }
  return null;
}

/** Per-health-factor accent color. */
const FACTOR_COLORS: Record<string, string> = {
  modularity: "#00C2C2",
  coupling: "#F59E0B",
  test_presence: "#6C63FF",
  parse_health: "#10B981",
  diagnostics: "#F43F5E",
};

const RECENT_PAGE_SIZE = 10;

function unboundedStart(ms: number): boolean {
  return !Number.isFinite(ms) || ms < -1e15;
}

function activityWindowStart(
  days: readonly { date: string }[],
  startMs: number,
  endMs: number,
): number {
  if (!unboundedStart(startMs)) return startMs;
  const first = days[0]?.date;
  if (!first) return endMs;
  const ms = Date.parse(first.length === 10 ? `${first}T00:00:00` : first);
  return Number.isFinite(ms) ? ms : endMs;
}

function tokenDayStartMs(dayKey: string): number {
  const parts = dayKey.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getTime();
}

type CachedCoreReports = {
  readonly testing: TestingReport | null;
  readonly security: SecurityReport | null;
};

/** Survive Overview remounts when the rail changes tabs. */
const coreReportCache = new Map<string, CachedCoreReports>();

function coreReportKey(rootPath: string, generatedAt: string): string {
  return `${rootPath}::${generatedAt}`;
}

/** Whether git data is still loading, present, absent, or failed to read. */
export type GitStatus = "loading" | "ready" | "unavailable" | "error";

export type OverviewScreenProps = {
  readonly map: RepositoryMap;
  readonly repoLabel: string;
  readonly gitActivity: GitActivity | null;
  /**
   * `unavailable` means Prism looked and there is no git data; `error` means
   * reading it failed. Collapsing the two reported a failure the user could
   * act on when nothing had gone wrong (ADR-0029).
   */
  readonly gitStatus?: GitStatus;
  readonly health: HealthScore | null;
  readonly dna?: DnaReport | null;
  /** Optional preloaded scores from dashboard payload. */
  readonly testingScore?: number | null;
  readonly securityScore?: number | null;
  /** Archive jobs — drives the Overview token spark for the same date range. */
  readonly jobs?: readonly JobSummary[];
  /** Top-bar workspace. Token usage and other job rollups stay in this repo. */
  readonly workspacePath?: string;
  readonly onOpenMap?: () => void;
  readonly onOpenDna: () => void;
  /** @deprecated M-062 — Profile merged into DNA; prefer onOpenDna. */
  readonly onOpenProfile?: () => void;
  readonly onOpenDomains?: () => void;
  /** @deprecated M-078 — Domains UI unmounted; chips no longer navigate. */
  readonly onOpenDomain?: (domainId: string) => void;
  readonly onOpenTesting?: () => void;
  readonly onOpenBlast?: (seedPath?: string) => void;
  /** @deprecated M-078 — map unmounted; region rows stay display-only. */
  readonly onFocusMapNode?: (nodeId: string) => void;
  readonly onOpenTrends?: () => void;
  readonly onOpenIntegrations?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onOpenReview?: () => void;
  readonly onOpenExplain?: () => void;
  readonly onOpenGuard?: () => void;
  /** Iris, Jobs, Skills, and any other rail id not handled above. */
  readonly onNavigate?: (view: AppView) => void;
  /** Indexed card opens Envelope details when the host can embed it. */
  readonly onOpenEnvelope?: () => void;
  /** Open a repo-relative path in the host editor when a path is known. */
  readonly onOpenPath?: (path: string) => void;
  readonly onRefresh: () => void;
  /** Fetch remote git (and refresh local activity). */
  readonly onSyncGit?: () => Promise<void>;
};

/** Rail clicks Overview used to drop (iris / jobs / skills) go through `onNavigate`. */
export function routeOverviewNav(
  view: AppView,
  props: Pick<
    OverviewScreenProps,
    | "onOpenDna"
    | "onOpenBlast"
    | "onOpenTrends"
    | "onOpenIntegrations"
    | "onOpenSettings"
    | "onOpenReview"
    | "onOpenExplain"
    | "onOpenGuard"
    | "onNavigate"
  >,
): void {
  if (view === "dna") props.onOpenDna();
  else if (view === "blast" || view === "impact") props.onOpenBlast?.();
  else if (view === "trends") props.onOpenTrends?.();
  else if (view === "integrations") props.onOpenIntegrations?.();
  else if (view === "settings") props.onOpenSettings?.();
  else if (view === "review") props.onOpenReview?.();
  else if (view === "explain") props.onOpenExplain?.();
  else if (view === "guard") props.onOpenGuard?.();
  else props.onNavigate?.(view);
}

/** Accent palette for the compact language-composition bar. */
const PROFILE_LANG_COLORS = [
  "#6C63FF",
  "#00C2C2",
  "#F59E0B",
  "#10B981",
  "#F43F5E",
  "#3B82F6",
];

function profileTitleCase(id: string): string {
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Stop KPI card navigation when interacting with InfoTips. */
function TipGuard(props: { children: ReactNode }): ReactElement {
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {props.children}
    </span>
  );
}

function kpiKeyActivate(e: ReactKeyboardEvent, action: () => void): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    action();
  }
}

export function OverviewScreen(props: OverviewScreenProps): ReactElement {
  const { map, gitActivity, health, dna } = props;
  const client = useAppShellClient();
  const cachedReports = coreReportCache.get(
    coreReportKey(map.rootPath, map.generatedAt),
  );
  const [testingReport, setTestingReport] = useState<TestingReport | null>(
    () => cachedReports?.testing ?? null,
  );
  const [securityReport, setSecurityReport] = useState<SecurityReport | null>(
    () => cachedReports?.security ?? null,
  );

  useEffect(() => {
    const key = coreReportKey(map.rootPath, map.generatedAt);
    const hit = coreReportCache.get(key);
    if (hit) {
      setTestingReport(hit.testing);
      setSecurityReport(hit.security);
    }
    let cancelled = false;
    void (async () => {
      try {
        const [t, s] = await Promise.all([
          client.fetchTestingReport?.() ?? Promise.resolve(null),
          client.fetchSecurityReport?.() ?? Promise.resolve(null),
        ]);
        if (cancelled) return;
        setTestingReport(t);
        setSecurityReport(s);
        coreReportCache.set(key, { testing: t, security: s });
      } catch {
        /* keep cache / props — dual-stat falls back to health factor */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, map.rootPath, map.generatedAt]);

  const profileLangs = useMemo(
    () =>
      [...(dna?.languages ?? [])]
        .filter((l) => Math.round(l.share * 100) > 0)
        .sort((a, b) => b.share - a.share),
    [dna],
  );
  const profileDomains = dna?.stack?.domains ?? [];
  const primaryDomainId =
    dna?.primaryDomain ?? dna?.rankedDomains?.[0]?.id ?? profileDomains[0];

  const detectedDomainIds = useMemo(() => {
    const ids = new Set<string>(profileDomains);
    for (const d of dna?.rankedDomains ?? []) ids.add(d.id);
    // Always offer DevOps from local CI overlays — Remote Git toggle is fetch-only.
    ids.add("devops_platform");
    return ids;
  }, [dna?.rankedDomains, profileDomains]);

  const detectedDomainChips = useMemo(
    () => DOMAIN_CATALOG.filter((d) => detectedDomainIds.has(d.id)),
    [detectedDomainIds],
  );

  const nodes = map.graph.nodes.length;
  const edges = map.graph.edges.length;
  const filesCount = useMemo(
    () => map.graph.nodes.filter((n) => n.kind === "file").length,
    [map.graph],
  );

  const density = couplingDensity(map.graph);
  const regionResult = useMemo(() => deriveRegions(map.graph), [map.graph]);
  const regions = regionResult.regions;
  const connected = useMemo(
    () => deriveMostConnected(map.graph, 5),
    [map.graph],
  );
  const factorById = useMemo(() => {
    const m = new Map<string, HealthScore["factors"][number]>();
    for (const f of health?.factors ?? []) m.set(f.id, f);
    return m;
  }, [health]);

  // Null until health is computed. Rendering it as 0 told the user their
  // repository scored 0/100 when Prism had not scored it at all (ADR-0029).
  const overall = health?.score ?? null;
  const overallLabel = overall === null ? "—" : String(overall);
  const testFactor = factorById.get("test_presence")?.score;
  const testScore =
    testingReport?.score ??
    props.testingScore ??
    (testFactor === undefined ? null : Math.round(testFactor));
  const securityScore = securityReport?.score ?? props.securityScore ?? null;

  const recentCommits = gitActivity?.recentCommits ?? [];
  const [commitPage, setCommitPage] = useState(0);
  const commitPageCount = Math.max(
    1,
    Math.ceil(recentCommits.length / RECENT_PAGE_SIZE),
  );
  const safeCommitPage = Math.min(commitPage, commitPageCount - 1);
  const pageCommits = recentCommits.slice(
    safeCommitPage * RECENT_PAGE_SIZE,
    (safeCommitPage + 1) * RECENT_PAGE_SIZE,
  );
  const pageAdditions = pageCommits.reduce(
    (sum, c) => sum + (c.additions ?? 0),
    0,
  );
  const pageDeletions = pageCommits.reduce(
    (sum, c) => sum + (c.deletions ?? 0),
    0,
  );

  const branch = gitActivity?.summary?.branch ?? "main";
  const gitSummary = gitActivity?.summary;
  const gitHistoryNote =
    gitSummary?.historyTruncated === true
      ? `Scanned latest ${gitSummary.windowCommits.toLocaleString()} of ${gitSummary.totalCommits.toLocaleString()} commits`
      : null;
  const [syncing, setSyncing] = useState(false);

  /** Header stamp = last indexed time (map generation), not git fetch. */
  const lastIndexedIso = map.generatedAt;
  const lastIndexedLabel = `Last indexed ${relativeTime(lastIndexedIso)}`;
  const gitUser = gitActivity?.recentCommits[0];
  const days = gitActivity?.days ?? [];

  const [nowMs] = useState(() => Date.now());
  const [range, setRange] = useState<DateRangeValue>(() => {
    const window = jobRangeWindow(DEFAULT_JOB_RANGE, Date.now());
    return {
      preset: DEFAULT_JOB_RANGE,
      startMs: window.startMs,
      endMs: window.endMs,
    };
  });
  const [tokenRange, setTokenRange] = useState<DateRangeValue>(() => {
    const window = jobRangeWindow(DEFAULT_JOB_RANGE, Date.now());
    return {
      preset: DEFAULT_JOB_RANGE,
      startMs: window.startMs,
      endMs: window.endMs,
    };
  });

  const activity = useMemo(
    () =>
      bucketActivity(
        days,
        activityWindowStart(days, range.startMs, range.endMs),
        range.endMs,
      ),
    [days, range.startMs, range.endMs],
  );
  const repoJobs = useMemo(
    () =>
      (props.jobs ?? []).filter((job) =>
        jobMatchesRepo(job, props.workspacePath),
      ),
    [props.jobs, props.workspacePath],
  );
  const tokenUsage = useMemo(
    () =>
      repoJobs.length > 0
        ? tokenUsageInRange(repoJobs, tokenRange.startMs, tokenRange.endMs)
        : undefined,
    [repoJobs, tokenRange.startMs, tokenRange.endMs],
  );

  const couplingBadge = couplingBadgeFor(density);

  const gitStatus = props.gitStatus ?? "loading";
  const gitEmptyMessage = (loadingText: string, notGitText: string): string => {
    if (gitStatus === "error") {
      return "Couldn't read local git — check the logs.";
    }
    if (gitStatus === "unavailable") return notGitText;
    if (gitActivity && !gitActivity.available) return notGitText;
    return loadingText;
  };

  const handleSync = (): void => {
    if (syncing) return;
    setSyncing(true);
    const started = performance.now();
    void (async () => {
      try {
        if (isGitIntegrationEnabled() && client.gitFetch) {
          const fetchResult = await client.gitFetch();
          recordAudit({
            category: "git",
            operation: "Remote git fetch",
            target: props.repoLabel,
            durationMs: performance.now() - started,
            status: fetchResult.ok ? "success" : "error",
            command: "git fetch --prune",
            output: fetchResult.ok
              ? "ok"
              : (fetchResult.error ?? "fetch failed"),
          });
        }
        if (props.onSyncGit) await props.onSyncGit();
        else props.onRefresh();
      } finally {
        setSyncing(false);
      }
    })();
  };

  const healthTone = overall !== null && overall >= 70 ? "emerald" : "amber";

  const handleDownloadReport = (): void => {
    if (typeof document === "undefined") return;
    const markdown = buildReportMarkdown({
      repoLabel: props.repoLabel,
      branch,
      generatedAtIso: map.generatedAt,
      lastSyncIso: lastIndexedIso,
      health: health
        ? {
            score: health.score,
            grade: health.grade,
            factors: health.factors.map((f) => ({
              label: f.label,
              score: f.score,
            })),
          }
        : null,
      couplingDensity: density,
      nodes,
      edges,
      files: filesCount,
      regions: regions.length,
      primaryDomain: primaryDomainId
        ? domainDisplayName(primaryDomainId)
        : null,
      detectedDomains: detectedDomainChips.map((d) => d.shortLabel),
      mostConnected: connected.map((r) => ({
        label: r.label,
        kind: r.kind,
        degree: r.degree,
      })),
      recentActivity: recentCommits.slice(0, RECENT_PAGE_SIZE).map((c) => ({
        sha: c.sha,
        author: c.author,
        message: c.message,
        date: c.date,
      })),
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reportFilename(props.repoLabel);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="overview"
        repoLabel={props.repoLabel}
        user={gitUser ?? null}
        onNavigate={(view) => routeOverviewNav(view, props)}
      />

      {/* ---- Main ---- */}
      <div className="ov-main">
        <header className="ov-top">
          <div>
            <Text variant="page" as="div" className="ov-top__title">
              Overview
            </Text>
            <Text variant="caption" as="div" className="ov-top__sub">
              {props.repoLabel} · {branch} · {lastIndexedLabel}
            </Text>
          </div>
          <div className="ov-top__actions">
            <div className="ov-top__sync">
              <button
                type="button"
                className="ov-btn ov-btn--ghost"
                onClick={handleSync}
                disabled={syncing}
                title={
                  isGitIntegrationEnabled() && client.gitFetch
                    ? "Fetch remote git and refresh local activity"
                    : "Refresh local git activity from the work tree"
                }
              >
                <RefreshCw size={13} aria-hidden />
                {isGitIntegrationEnabled() && client.gitFetch
                  ? "Fetch remote git"
                  : "Refresh git"}
              </button>
            </div>
            <button
              type="button"
              className="ov-btn ov-btn--ghost"
              onClick={handleDownloadReport}
              title="Download a Markdown report of this dashboard"
            >
              <Download size={13} aria-hidden />
              Download report
            </button>
          </div>
        </header>

        <div className="ov-scroll">
          {/* KPI row */}
          <section className="ov-kpis">
            <article
              className="ov-stat ov-stat--ring ov-stat--clickable"
              role="button"
              tabIndex={0}
              onClick={props.onOpenDna}
              onKeyDown={(e) => kpiKeyActivate(e, props.onOpenDna)}
              aria-label="Open DNA Analysis from Health Score"
            >
              <HealthRing score={overall} />
              <div>
                <div className="ov-stat__k">
                  <CardIcon icon={Activity} tone={healthTone} size={14} />
                  Health Score
                  <TipGuard>
                    <InfoTip label="Health Score">
                      Below 70 means prioritize Factors below 70 on DNA
                      Analysis. Same composite as the DNA Health Score (parse,
                      tests, coupling, modularity, diagnostics).
                    </InfoTip>
                  </TipGuard>
                </div>
                <div className="ov-stat__v">
                  {overallLabel}
                  <span className="ov-stat__unit">/100</span>
                </div>
                {health ? (
                  <div className="ov-stat__note">Grade {health.grade}</div>
                ) : (
                  <div className="ov-stat__note ov-stat__note--muted">
                    Indexing…
                  </div>
                )}
              </div>
            </article>

            <article
              className="ov-stat ov-stat--clickable"
              role="button"
              tabIndex={0}
              onClick={props.onOpenDna}
              onKeyDown={(e) => kpiKeyActivate(e, props.onOpenDna)}
              aria-label="Open DNA Analysis from Coupling Density"
            >
              <div className="ov-stat__head">
                <span className="ov-stat__k">
                  <CardIcon icon={Layers} tone="violet" size={14} />
                  Coupling Density
                  <TipGuard>
                    <InfoTip label="Coupling Density">
                      <p>
                        Use this to judge whether modules are tightly coupled
                        before a refactor — lower density means looser coupling
                        and a smaller blast radius.
                      </p>
                      <p>
                        <strong>Computed as:</strong> edges ÷ nodes on the
                        dependency graph for analyzed TypeScript/JavaScript
                        files at the current map zoom (not every file in the
                        inventory).
                      </p>
                      <p>
                        <strong>Target:</strong> &lt; 0.50
                      </p>
                      <p>
                        Distinct from the DNA TS/JS import coupling factor,
                        which scores import cycles.
                      </p>
                    </InfoTip>
                  </TipGuard>
                </span>
                <span className={`ov-badge ov-badge--${couplingBadge.tone}`}>
                  {couplingBadge.label}
                </span>
              </div>
              <div className="ov-stat__v">{density.toFixed(2)}</div>
              <div className="ov-meter">
                <span
                  className="ov-meter__fill"
                  style={{
                    width: `${couplingDensityPct(density)}%`,
                    background: "#F59E0B",
                  }}
                />
              </div>
              <div className="ov-stat__note">Target: &lt; 0.50</div>
            </article>

            <article className="ov-stat ov-stat--dual">
              <div className="ov-stat__head">
                <span className="ov-stat__k">
                  Testing &amp; Security
                  <TipGuard>
                    <InfoTip label="Testing & Security">
                      Health-factor headlines from Core testing and security
                      reports. Testing covers suite diversity and coverage;
                      Security covers left-shift tools and fundamental checks.
                    </InfoTip>
                  </TipGuard>
                </span>
              </div>
              <div className="ov-stat__dual">
                <div className="ov-stat__dual-item">
                  <div className="ov-stat__dual-label">
                    <CardIcon icon={FlaskConical} tone="violet" size={12} />
                    Test
                  </div>
                  <div className="ov-stat__v">
                    {testScore !== null ? Math.round(testScore) : "—"}
                    {testScore !== null ? (
                      <span className="ov-stat__unit">/100</span>
                    ) : null}
                  </div>
                </div>
                <div className="ov-stat__dual-item">
                  <div className="ov-stat__dual-label">
                    <CardIcon icon={Shield} tone="emerald" size={12} />
                    Security
                  </div>
                  <div className="ov-stat__v">
                    {securityScore !== null ? Math.round(securityScore) : "—"}
                    {securityScore !== null ? (
                      <span className="ov-stat__unit">/100</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="ov-stat__note">from Core reports</div>
            </article>

            <article
              className="ov-stat ov-stat--clickable ov-stat--envelope"
              role="button"
              tabIndex={0}
              onClick={() =>
                props.onOpenEnvelope?.() ?? props.onNavigate?.("iris")
              }
              onKeyDown={(e) =>
                kpiKeyActivate(
                  e,
                  () => props.onOpenEnvelope?.() ?? props.onNavigate?.("iris"),
                )
              }
              aria-label="Open Envelope from indexed coverage"
            >
              <div className="ov-stat__head">
                <span className="ov-stat__k">
                  <CardIcon icon={Boxes} tone="brand" size={14} />
                  Indexed
                  <TipGuard>
                    <InfoTip label="Indexed">
                      Share of inventory files your Prismate has analysed and
                      understood. Click to open Envelope.
                    </InfoTip>
                  </TipGuard>
                </span>
              </div>
              <div className="ov-stat__v">
                {health?.graphCoveragePct !== undefined
                  ? `${Math.round(health.graphCoveragePct)}`
                  : "—"}
                {health?.graphCoveragePct !== undefined ? (
                  <span className="ov-stat__unit">%</span>
                ) : null}
              </div>
              <div className="ov-stat__note">
                of files analysed · open Envelope
              </div>
            </article>
          </section>

          {/* Middle: DNA + Activity */}
          <section className="ov-grid ov-grid--2 ov-grid--match">
            <article className="ov-card">
              <div className="ov-card__head">
                <Text variant="card" as="span" className="ov-card__title">
                  <Dna size={14} className="ov-card__icon" aria-hidden />
                  DNA Analysis
                  <InfoTip label="DNA Analysis">
                    Open this when a factor looks weak — each card explains what
                    to do next. Bars match Health Score (
                    <em>TS/JS import coupling</em> scores import cycles).
                  </InfoTip>
                </Text>
                <button
                  type="button"
                  className="ov-card__open"
                  onClick={props.onOpenDna}
                  aria-label="Open DNA Analysis"
                >
                  <ArrowRight size={15} aria-hidden />
                </button>
              </div>
              {health ? (
                <>
                  <div className="ov-dna">
                    {health.factors.map((f) => (
                      <div key={f.id} className="ov-dna__row" title={f.note}>
                        <div className="ov-dna__head">
                          <span>{f.label}</span>
                          <span
                            className="ov-dna__val"
                            style={{
                              color: FACTOR_COLORS[f.id] ?? "#94A3B8",
                            }}
                          >
                            {Math.round(f.score)}
                          </span>
                        </div>
                        <div className="ov-dna__track">
                          <span
                            className="ov-dna__fill"
                            style={{
                              width: `${f.score}%`,
                              background: FACTOR_COLORS[f.id] ?? "#94A3B8",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="ov-dna__overall">
                    <span>Overall Health Score</span>
                    <strong>
                      {overallLabel} / 100
                      {health?.grade ? (
                        <span className="ov-dna__grade">
                          Grade {health.grade}
                        </span>
                      ) : null}
                    </strong>
                  </div>
                  {health.graphCoveragePct !== undefined ? (
                    <p className="ov-stat__note" style={{ marginTop: 8 }}>
                      Graph coverage {health.graphCoveragePct}% of inventory
                      files (TS/JS analyzed)
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="ov-empty">Computing health factors…</p>
              )}
            </article>

            <article className="ov-card ov-card--activity">
              <div className="ov-card__head">
                <Text variant="card" as="span" className="ov-card__title">
                  <Activity size={14} className="ov-card__icon" aria-hidden />
                  Commit Activity
                </Text>
                <DateRangePicker
                  aria-label="Time range"
                  className="jobs-screen__range"
                  presets={JOB_RANGE_PRESETS}
                  value={range}
                  nowMs={nowMs}
                  presetWindow={jobRangeWindow}
                  onChange={setRange}
                />
              </div>

              {activity.buckets.length > 0 && activity.total > 0 ? (
                <ActivityChart
                  values={activity.buckets}
                  starts={activity.starts}
                  granularity={activity.granularity}
                  total={activity.total}
                />
              ) : gitStatus === "loading" && days.length === 0 ? (
                <ChartSkeleton label="Loading commit history" />
              ) : (
                <p className="ov-empty">
                  {days.length > 0
                    ? "No commits in this range."
                    : gitEmptyMessage(
                        "Loading commit history…",
                        "Not a git repository.",
                      )}
                </p>
              )}
              {gitHistoryNote ? (
                <p className="ov-stat__note" style={{ marginTop: 8 }}>
                  {gitHistoryNote}
                </p>
              ) : null}
            </article>
          </section>

          <article className="ov-card ov-card--token">
            <div className="ov-card__head">
              <Text variant="card" as="span" className="ov-card__title">
                <Coins size={14} className="ov-card__icon" aria-hidden />
                Token usage
              </Text>
              <DateRangePicker
                aria-label="Token usage range"
                className="jobs-screen__range"
                presets={JOB_RANGE_PRESETS}
                value={tokenRange}
                nowMs={nowMs}
                presetWindow={jobRangeWindow}
                onChange={setTokenRange}
              />
            </div>
            {tokenUsage && tokenUsage.total > 0 ? (
              <ActivityChart
                values={tokenUsage.buckets.map((b) => b.totalTokens)}
                starts={tokenUsage.buckets.map((b) =>
                  tokenDayStartMs(b.dayKey),
                )}
                granularity="day"
                total={tokenUsage.total}
                noun="token"
                formatValue={formatCompactCount}
              />
            ) : (
              <p className="ov-empty">No token usage in this range.</p>
            )}
          </article>

          {/* Bottom: Profile + Recent */}
          <section className="ov-grid ov-grid--2">
            <article className="ov-card">
              <div className="ov-card__head">
                <Text variant="card" as="span" className="ov-card__title">
                  <Boxes size={14} className="ov-card__icon" aria-hidden />
                  Codebase Profile
                  <InfoTip label="Codebase Profile">
                    Quick stack snapshot. Open DNA Analysis for the full profile
                    — frameworks, packages, signals, and personas.
                  </InfoTip>
                </Text>
                <button
                  type="button"
                  className="ov-card__open"
                  onClick={props.onOpenDna}
                  aria-label="Open Codebase Profile on DNA Analysis"
                >
                  <ArrowRight size={15} aria-hidden />
                </button>
              </div>
              {dna ? (
                <>
                  <div className="ov-profile__bar">
                    {profileLangs.slice(0, 6).map((l, i) => (
                      <span
                        key={l.id}
                        className="ov-profile__seg"
                        style={{
                          width: `${l.share * 100}%`,
                          background:
                            PROFILE_LANG_COLORS[i % PROFILE_LANG_COLORS.length],
                        }}
                        title={`${profileTitleCase(l.id)}: ${Math.round(l.share * 100)}%`}
                      />
                    ))}
                  </div>
                  <div className="ov-profile__legend">
                    {profileLangs.slice(0, 4).map((l, i) => (
                      <span key={l.id} className="ov-profile__leg">
                        <span
                          className="ov-dot"
                          style={{
                            background:
                              PROFILE_LANG_COLORS[
                                i % PROFILE_LANG_COLORS.length
                              ],
                          }}
                        />
                        {profileTitleCase(l.id)}
                        <span className="ov-mono ov-profile__pct">
                          {Math.round(l.share * 100)}%
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="ov-profile__facts">
                    <div className="ov-profile__fact">
                      <span className="ov-profile__k">Primary domain</span>
                      <span className="ov-profile__v">
                        {primaryDomainId
                          ? domainDisplayName(primaryDomainId)
                          : "—"}
                      </span>
                    </div>
                    <div className="ov-profile__fact">
                      <span className="ov-profile__k">Stack domains</span>
                      <span className="ov-profile__v">
                        {profileDomains.length}
                      </span>
                    </div>
                    <div className="ov-profile__fact">
                      <span className="ov-profile__k">Frameworks</span>
                      <span className="ov-profile__v">
                        {dna.frameworks.length}
                      </span>
                    </div>
                    <div className="ov-profile__fact">
                      <span className="ov-profile__k">Package manager</span>
                      <span className="ov-profile__v">
                        {dna.packageManager
                          ? profileTitleCase(dna.packageManager)
                          : "—"}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="ov-empty">Detecting codebase profile…</p>
              )}
            </article>

            <article className="ov-card">
              <div className="ov-card__head">
                <Text variant="card" as="span" className="ov-card__title">
                  <Clock size={14} className="ov-card__icon" aria-hidden />
                  Recent Activity
                </Text>
                {pageCommits.length > 0 ? (
                  <span
                    className="ov-sync"
                    title="Line churn for commits on this page"
                  >
                    <span
                      className="ov-sync__stat ov-add"
                      data-on={pageAdditions > 0 ? "true" : "false"}
                    >
                      ↑{pageAdditions}
                    </span>
                    <span
                      className="ov-sync__stat ov-del"
                      data-on={pageDeletions > 0 ? "true" : "false"}
                    >
                      ↓{pageDeletions}
                    </span>
                  </span>
                ) : (
                  <span className="ov-card__meta">local git</span>
                )}
              </div>
              {recentCommits.length > 0 ? (
                <>
                  <div className="ov-activity">
                    {pageCommits.map((commit) => {
                      const pathGuess = guessPathFromCommitMessage(
                        commit.message,
                        map,
                      );
                      const open = (): void => {
                        if (pathGuess && props.onOpenPath) {
                          props.onOpenPath(pathGuess);
                        } else {
                          props.onOpenTrends?.();
                        }
                      };
                      const clickable = Boolean(
                        (pathGuess && props.onOpenPath) || props.onOpenTrends,
                      );
                      return (
                        <div
                          key={commit.sha}
                          className={
                            clickable
                              ? "ov-activity__row ov-activity__row--clickable"
                              : "ov-activity__row"
                          }
                          role={clickable ? "button" : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          onClick={clickable ? open : undefined}
                          onKeyDown={
                            clickable
                              ? (e) => kpiKeyActivate(e, open)
                              : undefined
                          }
                          title={
                            pathGuess
                              ? `Open ${pathGuess}`
                              : props.onOpenTrends
                                ? "Open Trends for health history"
                                : undefined
                          }
                        >
                          <Avatar
                            name={commit.author}
                            email={commit.email}
                            size={28}
                          />
                          <div className="ov-activity__body">
                            <div
                              className="ov-activity__file ov-ellipsis"
                              title={commit.message}
                            >
                              {commit.message || commit.sha.slice(0, 7)}
                            </div>
                            <div className="ov-activity__meta">
                              <span className="ov-mono">
                                {commit.sha.slice(0, 7)}
                              </span>{" "}
                              · {commit.author}
                              {commit.pushed === false ? (
                                <span className="ov-tag ov-tag--local">
                                  Local
                                </span>
                              ) : null}
                            </div>
                            <div className="ov-activity__time">
                              {relativeTime(commit.date)}
                              {commit.additions !== undefined ||
                              commit.deletions !== undefined ? (
                                <>
                                  {" "}
                                  ·{" "}
                                  <span className="ov-add">
                                    +{commit.additions ?? 0}
                                  </span>{" "}
                                  <span className="ov-del">
                                    −{commit.deletions ?? 0}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {recentCommits.length > RECENT_PAGE_SIZE ? (
                    <div className="ov-pager">
                      <button
                        type="button"
                        className="ov-pager__btn"
                        disabled={safeCommitPage <= 0}
                        onClick={() => setCommitPage((p) => Math.max(0, p - 1))}
                      >
                        Previous
                      </button>
                      <span className="ov-pager__meta">
                        {safeCommitPage + 1} / {commitPageCount}
                      </span>
                      <button
                        type="button"
                        className="ov-pager__btn"
                        disabled={safeCommitPage >= commitPageCount - 1}
                        onClick={() =>
                          setCommitPage((p) =>
                            Math.min(commitPageCount - 1, p + 1),
                          )
                        }
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                  <p className="ov-card__foot-note">
                    Last indexed {relativeTime(lastIndexedIso)}
                  </p>
                </>
              ) : (
                <p className="ov-empty">
                  {gitEmptyMessage(
                    "Loading local git history…",
                    "Not a git repository — no local history.",
                  )}
                </p>
              )}
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Circular health donut. `score` is null while health is unknown — never
 * default to 0, which used to paint a failing red ring (ADR-0029).
 */
function HealthRing(props: { score: number | null }): ReactElement {
  const known = props.score !== null;
  const score = known ? Math.max(0, Math.min(100, props.score!)) : 0;
  const color = known ? scoreColor(props.score!) : "var(--prism-ink-4)";
  const size = 56;
  const center = size / 2;
  const stroke = 5;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  return (
    <div
      className="ov-ring"
      data-no-data={!known}
      aria-label={
        known ? `Health ${props.score}` : "Health score not computed yet"
      }
    >
      <svg
        className="ov-ring__svg"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--prism-line, #2a334a)"
          strokeWidth={stroke}
        />
        {known ? (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </svg>
      <span className="ov-ring__label" style={{ color }}>
        {known ? props.score : "—"}
      </span>
    </div>
  );
}

/** Format a bucket start (local calendar day) for the hover tooltip. */
function bucketLabel(ms: number, granularity: "day" | "week"): string {
  const d = new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return granularity === "week" ? `Week of ${d}` : d;
}

function axisDateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** Chart-shaped shimmer while git history is still loading. */
function ChartSkeleton(props: { label: string }): ReactElement {
  return (
    <div className="ov-chart ov-chart-skel" role="status" aria-busy="true">
      <span className="ov-sr">{props.label}</span>
      <div className="ov-chart-skel__frame" aria-hidden>
        <div className="ov-chart-skel__y">
          <span className="sk ov-chart-skel__tick" />
          <span className="sk ov-chart-skel__tick" />
          <span className="sk ov-chart-skel__tick" />
        </div>
        <span className="sk ov-chart-skel__area" />
      </div>
      <div className="ov-chart-skel__x" aria-hidden>
        <span className="sk ov-chart-skel__tick" />
        <span className="sk ov-chart-skel__tick" />
        <span className="sk ov-chart-skel__tick" />
        <span className="sk ov-chart-skel__tick" />
      </div>
      <span
        className="sk sk-line sk-line--sm ov-chart-skel__legend"
        aria-hidden
      />
    </div>
  );
}

/** Real commit-activity area chart derived from git day/week buckets. */
function ActivityChart(props: {
  values: number[];
  starts: number[];
  granularity: "day" | "week";
  total: number;
  noun?: string;
  formatValue?: (n: number) => string;
}): ReactElement {
  const w = 600;
  const h = 180;
  const pad = 8;
  const unit = props.granularity === "day" ? "day" : "week";
  const noun = props.noun ?? "commit";
  const shown = props.formatValue ?? String;

  const n = props.values.length;
  const max = Math.max(1, ...props.values);
  const geo = activityGeometry(props.values, w, h, pad, { min: 0, max });
  const points = geo.points.map(([x, y]) => ({ x, y }));
  const xLabels = pickAxisIndices(n).map((i) => ({
    fraction: (points[i]?.x ?? 0) / w,
    label: axisDateLabel(props.starts[i] ?? 0),
  }));

  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Retain the last index so the marker stays put (and fades out) on mouse
  // leave instead of sliding back to the origin.
  const [lastIndex, setLastIndex] = useState(0);

  const onMove = (e: ReactMouseEvent<HTMLDivElement>): void => {
    const el = plotRef.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const frac = Math.max(
      0,
      Math.min(1, (relX - pad) / Math.max(1, w - pad * 2)),
    );
    const next = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    setHover(next);
    setLastIndex(next);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (n === 0) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const base = hover ?? lastIndex;
    const next =
      e.key === "ArrowLeft" ? Math.max(0, base - 1) : Math.min(n - 1, base + 1);
    setHover(next);
    setLastIndex(next);
  };

  const idx = Math.max(0, Math.min(hover ?? lastIndex, n - 1));
  const hp = points[idx];
  const leftPct = hp ? (hp.x / w) * 100 : 0;
  const tipEdge = chartTipEdge(leftPct / 100);
  const visible = hover !== null && hp !== undefined;

  return (
    <div className="ov-chart">
      <CartesianFrame
        width={w}
        height={h}
        pad={pad}
        min={0}
        max={max}
        integerY
        xLabels={xLabels}
        {...(props.formatValue ? { yFormat: props.formatValue } : {})}
      >
        <div
          ref={plotRef}
          className="ov-chart__plot"
          tabIndex={0}
          role="img"
          aria-label={`${shown(props.total)} ${noun}${props.total === 1 ? "" : "s"}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          <AreaChart
            values={props.values}
            width={w}
            height={h}
            pad={pad}
            minValue={0}
            maxValue={max}
            className="ov-chart__svg"
            label={`${shown(props.total)} ${noun}${props.total === 1 ? "" : "s"}`}
          />

          {hp ? (
            <>
              <span
                className="ov-chart__guide"
                data-visible={visible ? "true" : "false"}
                style={{ left: `${leftPct}%` }}
                aria-hidden
              />
              <span
                className="ov-chart__point"
                data-visible={visible ? "true" : "false"}
                style={{
                  left: `${leftPct}%`,
                  top: `${(hp.y / h) * 100}%`,
                }}
                aria-hidden
              />
              <div
                className="ov-chart__tip"
                data-visible={visible ? "true" : "false"}
                {...(tipEdge ? { "data-edge": tipEdge } : {})}
                style={{
                  left: `${leftPct}%`,
                  top: `${(hp.y / h) * 100}%`,
                }}
                role="status"
              >
                <strong>{shown(props.values[idx] ?? 0)}</strong> {noun}
                {(props.values[idx] ?? 0) === 1 ? "" : "s"}
                <span className="ov-chart__tip-date">
                  {bucketLabel(props.starts[idx] ?? 0, props.granularity)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </CartesianFrame>
      <div className="ov-chart__legend">
        <span>
          <span className="ov-dot" style={{ background: "#00C2C2" }} />{" "}
          {noun === "commit" ? "Commits" : "Tokens"} / {unit}
        </span>
        <span className="ov-chart__total">
          {shown(props.total)} {noun}
          {props.total === 1 ? "" : "s"} in window
        </span>
      </div>
    </div>
  );
}
