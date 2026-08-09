import type {
  DnaReport,
  GitActivity,
  HealthScore,
  RepositoryMap,
  SecurityReport,
  TestingReport,
} from "@repo-prism/shared";
import { CardIcon, relativeTime } from "@repo-prism/ui";
import {
  Activity,
  ArrowRight,
  Boxes,
  Clock,
  Compass,
  Dna,
  Download,
  FlaskConical,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Shield,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { AppSidebar } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { Avatar } from "./Avatar.js";
import { useAppShellClient } from "./client-context.js";
import { DOMAIN_CATALOG } from "./domain-catalog.js";
import { InfoTip } from "@repo-prism/ui";
import { isGitIntegrationEnabled } from "./integrations-store.js";
import { recordAudit } from "./audit-log.js";
import {
  ACTIVITY_RANGES,
  activityGeometry,
  bucketActivity,
  buildReportMarkdown,
  connectedNodeLabel,
  couplingBadge as couplingBadgeFor,
  couplingDensity,
  couplingDensityPct,
  DEFAULT_ACTIVITY_RANGE,
  deriveMostConnected,
  deriveRegions,
  domainDisplayName,
  parseDayMs,
  presetBounds,
  reportFilename,
  scoreColor,
  type ActivityRangeId,
} from "./overview-model.js";

/** Epoch-ms → `YYYY-MM-DD` for `<input type="date">` values. */
function toDayInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

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
  readonly onOpenMap: () => void;
  readonly onOpenDna: () => void;
  /** @deprecated M-062 — Profile merged into DNA; prefer onOpenDna. */
  readonly onOpenProfile?: () => void;
  readonly onOpenDomains?: () => void;
  /** Open a specific domain screen from an Overview chip. */
  readonly onOpenDomain?: (domainId: string) => void;
  readonly onOpenTesting?: () => void;
  readonly onOpenBlast?: (seedPath?: string) => void;
  /** Focus a map node/region when opening the Repository Map. */
  readonly onFocusMapNode?: (nodeId: string) => void;
  readonly onOpenTrends?: () => void;
  readonly onOpenIntegrations?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onOpenReview?: () => void;
  readonly onOpenExplain?: () => void;
  /** Open a repo-relative path in the host editor when a path is known. */
  readonly onOpenPath?: (path: string) => void;
  readonly onRefresh: () => void;
  /** Fetch remote git (and refresh local activity). */
  readonly onSyncGit?: () => Promise<void>;
};

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
  const [testingReport, setTestingReport] = useState<TestingReport | null>(
    null,
  );
  const [securityReport, setSecurityReport] = useState<SecurityReport | null>(
    null,
  );

  useEffect(() => {
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
      } catch {
        /* keep nulls — dual-stat falls back to props / health factor */
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

  const regionResult = useMemo(() => deriveRegions(map.graph), [map.graph]);
  const regions = regionResult.regions;
  const connected = useMemo(
    () => deriveMostConnected(map.graph, 5),
    [map.graph],
  );
  const maxDegree = Math.max(1, ...connected.map((r) => r.degree));

  const density = couplingDensity(map.graph);
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

  const [rangeId, setRangeId] = useState<ActivityRangeId>(
    DEFAULT_ACTIVITY_RANGE,
  );
  const [customStart, setCustomStart] = useState(() =>
    toDayInput(presetBounds(90).startMs),
  );
  const [customEnd, setCustomEnd] = useState(() =>
    toDayInput(presetBounds(90).endMs),
  );

  const activity = useMemo(() => {
    if (rangeId === "custom") {
      return bucketActivity(
        days,
        parseDayMs(customStart),
        parseDayMs(customEnd),
      );
    }
    const preset =
      ACTIVITY_RANGES.find((r) => r.id === rangeId) ??
      ACTIVITY_RANGES.find((r) => r.id === DEFAULT_ACTIVITY_RANGE)!;
    const { startMs, endMs } = presetBounds(preset.days);
    return bucketActivity(days, startMs, endMs);
  }, [days, rangeId, customStart, customEnd]);

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
        onNavigate={(view) => {
          if (view === "map") props.onOpenMap();
          else if (view === "dna") props.onOpenDna();
          else if (view === "domains") props.onOpenDomains?.();
          else if (view === "testing") props.onOpenTesting?.();
          else if (view === "blast") props.onOpenBlast?.();
          else if (view === "trends") props.onOpenTrends?.();
          else if (view === "integrations") props.onOpenIntegrations?.();
          else if (view === "settings") props.onOpenSettings?.();
          else if (view === "review") props.onOpenReview?.();
          else if (view === "explain") props.onOpenExplain?.();
        }}
      />

      {/* ---- Main ---- */}
      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Overview</div>
            <div className="ov-top__sub">
              {props.repoLabel} · {branch} · {lastIndexedLabel}
            </div>
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
            <button
              type="button"
              className="ov-btn ov-btn--primary"
              onClick={props.onOpenMap}
            >
              <MapIcon size={13} aria-hidden />
              Open Map
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
                      Use this to judge whether modules are tightly coupled
                      before a refactor — lower density means looser coupling
                      and a smaller blast radius. Computed as{" "}
                      <span className="ov-mono">edges ÷ nodes</span> on the
                      dependency graph for analyzed TypeScript/JavaScript files
                      at the current map zoom (not every file in the inventory).
                      Target &lt; 0.50. Distinct from the DNA{" "}
                      <em>TS/JS import coupling</em> factor, which scores import{" "}
                      <em>cycles</em>.
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

            <article
              className="ov-stat ov-stat--clickable ov-stat--dual"
              role="button"
              tabIndex={0}
              onClick={() => props.onOpenTesting?.()}
              onKeyDown={(e) =>
                kpiKeyActivate(e, () => props.onOpenTesting?.())
              }
              aria-label="Open Testing and Security"
            >
              <div className="ov-stat__head">
                <span className="ov-stat__k">
                  Testing &amp; Security
                  <TipGuard>
                    <InfoTip label="Testing & Security">
                      Dual scores from Core testing and security reports.
                      Testing covers suite diversity and coverage; Security
                      covers left-shift tools and fundamental checks.
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
              className="ov-stat ov-stat--clickable"
              role="button"
              tabIndex={0}
              onClick={props.onOpenMap}
              onKeyDown={(e) => kpiKeyActivate(e, props.onOpenMap)}
              aria-label="Open Repository Map from Graph Size"
            >
              <div className="ov-stat__head">
                <span className="ov-stat__k">
                  <CardIcon icon={Boxes} tone="brand" size={14} />
                  Graph Size
                  <TipGuard>
                    <InfoTip label="Graph Size">
                      Node and edge counts of the repository dependency graph,
                      plus the number of derived regions (feature/package/folder
                      groupings).
                    </InfoTip>
                  </TipGuard>
                </span>
              </div>
              <div className="ov-stat__v">{nodes.toLocaleString()}</div>
              <div className="ov-stat__note">
                {edges.toLocaleString()} dependencies ·{" "}
                {regionResult.truncated
                  ? `showing ${regions.length} of ${regionResult.totalCount} regions`
                  : `${regions.length} regions`}
              </div>
            </article>
          </section>

          {/* Middle: DNA + Activity */}
          <section className="ov-grid ov-grid--2">
            <article className="ov-card">
              <div className="ov-card__head">
                <span className="ov-card__title">
                  <Dna size={14} className="ov-card__icon" aria-hidden />
                  DNA Analysis
                  <InfoTip label="DNA Analysis">
                    Open this when a factor looks weak — each card explains what
                    to do next. Bars match Health Score (
                    <em>TS/JS import coupling</em> scores import cycles).
                  </InfoTip>
                </span>
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

            <article className="ov-card">
              <div className="ov-card__head">
                <span className="ov-card__title">
                  <Activity size={14} className="ov-card__icon" aria-hidden />
                  Commit Activity
                </span>
                <div
                  className="ov-seg"
                  role="group"
                  aria-label="Commit activity range"
                >
                  {ACTIVITY_RANGES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="ov-seg__btn"
                      data-active={rangeId === r.id ? "true" : "false"}
                      onClick={() => setRangeId(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ov-seg__btn"
                    data-active={rangeId === "custom" ? "true" : "false"}
                    onClick={() => setRangeId("custom")}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {rangeId === "custom" ? (
                <div className="ov-daterange">
                  <label className="ov-daterange__field">
                    <span>From</span>
                    <input
                      type="date"
                      value={customStart}
                      max={customEnd}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </label>
                  <label className="ov-daterange__field">
                    <span>To</span>
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {activity.buckets.length > 0 && activity.total > 0 ? (
                <ActivityChart
                  values={activity.buckets}
                  starts={activity.starts}
                  granularity={activity.granularity}
                  total={activity.total}
                />
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
              <p className="ov-card__foot-note">
                {props.onOpenTrends ? (
                  <>
                    View health history over time in{" "}
                    <button
                      type="button"
                      className="dm-linkbtn"
                      onClick={props.onOpenTrends}
                    >
                      Trends
                    </button>
                    .
                  </>
                ) : (
                  "Open Trends for health history over time."
                )}
              </p>
            </article>
          </section>

          {/* Bottom: Profile + Region health + Connected + Recent */}
          <section className="card-masonry">
            <article className="ov-card">
              <div className="ov-card__head">
                <span className="ov-card__title">
                  <Boxes size={14} className="ov-card__icon" aria-hidden />
                  Codebase Profile
                  <InfoTip label="Codebase Profile">
                    Quick stack snapshot. Open DNA Analysis for the full profile
                    — frameworks, packages, signals, and personas.
                  </InfoTip>
                </span>
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
                <span className="ov-card__title">
                  <Compass size={14} className="ov-card__icon" aria-hidden />
                  Explore Domains
                  <InfoTip label="Explore Domains">
                    Stack domains detected in this repository (Frontend,
                    Backend, DevOps, Mobile, Desktop, Data/ML). Open the Domains
                    tab to browse them and launch each domain&apos;s analysis
                    screen.
                  </InfoTip>
                </span>
                {props.onOpenDomains ? (
                  <button
                    type="button"
                    className="ov-card__open"
                    onClick={props.onOpenDomains}
                    aria-label="Open Domains"
                  >
                    <ArrowRight size={15} aria-hidden />
                  </button>
                ) : null}
              </div>
              {dna ? (
                <>
                  <div className="ov-domains">
                    {detectedDomainChips.length > 0 ? (
                      detectedDomainChips.map((d) => {
                        const Icon = d.icon;
                        const open = (): void => {
                          if (props.onOpenDomain) props.onOpenDomain(d.id);
                          else props.onOpenDomains?.();
                        };
                        const clickable = Boolean(
                          props.onOpenDomain || props.onOpenDomains,
                        );
                        if (!clickable) {
                          return (
                            <span
                              key={d.id}
                              className="ov-domains__chip"
                              data-on="true"
                              title={`${d.shortLabel} detected`}
                            >
                              <Icon size={12} aria-hidden />
                              {d.shortLabel}
                            </span>
                          );
                        }
                        return (
                          <button
                            key={d.id}
                            type="button"
                            className="ov-domains__chip ov-domains__chip--btn"
                            data-on="true"
                            title={`Open ${d.shortLabel} domain`}
                            onClick={open}
                          >
                            <Icon size={12} aria-hidden />
                            {d.shortLabel}
                          </button>
                        );
                      })
                    ) : (
                      <p className="ov-empty">No stack domains detected yet.</p>
                    )}
                  </div>
                  <p className="ov-domains__note">
                    {detectedDomainIds.size} detected · open to explore
                  </p>
                </>
              ) : (
                <p className="ov-empty">Detecting domains…</p>
              )}
            </article>

            <article className="ov-card">
              <div className="ov-card__head">
                <span className="ov-card__title">
                  <Layers size={14} className="ov-card__icon" aria-hidden />
                  Region Health
                  <InfoTip label="Region Health">
                    Click a region to focus it on the map. Lower scores mean
                    heavier dependency load — start decoupling there first.
                  </InfoTip>
                </span>
              </div>
              <div className="ov-table">
                <div className="ov-table__head">
                  <span>Region</span>
                  <span className="ov-table__num">Files</span>
                  <span className="ov-table__num">Score</span>
                </div>
                {regions.map((r) => {
                  const openRegion = (): void => {
                    props.onFocusMapNode?.(r.id);
                    props.onOpenMap();
                  };
                  const clickable = Boolean(props.onFocusMapNode);
                  return (
                    <div
                      key={r.id}
                      className={
                        clickable
                          ? "ov-table__row ov-table__row--clickable"
                          : "ov-table__row"
                      }
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? openRegion : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => kpiKeyActivate(e, openRegion)
                          : undefined
                      }
                    >
                      <span className="ov-table__region">
                        <span
                          className="ov-dot"
                          style={{ background: r.color }}
                        />
                        <span className="ov-mono ov-ellipsis" title={r.label}>
                          {r.label}
                        </span>
                      </span>
                      <span className="ov-table__num ov-mono">{r.files}</span>
                      <span
                        className="ov-table__num ov-mono"
                        style={{
                          color:
                            r.score === null ? undefined : scoreColor(r.score),
                        }}
                      >
                        {r.score ?? "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {regionResult.truncated ? (
                <p className="ov-stat__note" style={{ marginTop: 8 }}>
                  Showing {regions.length} of {regionResult.totalCount} regions
                </p>
              ) : null}
            </article>

            <article className="ov-card">
              <div className="ov-card__head">
                <span className="ov-card__title">
                  <Zap size={14} className="ov-card__icon" aria-hidden />
                  Most Connected
                  <InfoTip label="Most Connected">
                    Click a node to open Blast Radius for that seed — high
                    degree means a wider change surface.
                  </InfoTip>
                </span>
                {props.onOpenBlast ? (
                  <button
                    type="button"
                    className="ov-card__open"
                    onClick={() => props.onOpenBlast?.()}
                    aria-label="Open Blast Radius"
                  >
                    <ArrowRight size={15} aria-hidden />
                  </button>
                ) : null}
              </div>
              {connected.length > 0 ? (
                <>
                  <div className="ov-bars">
                    {connected.slice(0, 3).map((r) => {
                      const seed =
                        r.kind === "file"
                          ? r.id.startsWith("file:")
                            ? r.id.slice("file:".length)
                            : r.label
                          : undefined;
                      const open = (): void => {
                        props.onOpenBlast?.(seed);
                      };
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className="ov-bars__col ov-bars__col--btn"
                          onClick={open}
                          disabled={!props.onOpenBlast}
                          title={`Open blast radius for ${connectedNodeLabel(r)}`}
                        >
                          <div className="ov-bars__track">
                            <span
                              className="ov-bars__fill"
                              style={{
                                height: `${(r.degree / maxDegree) * 100}%`,
                                background: r.color,
                              }}
                            />
                          </div>
                          <div
                            className="ov-bars__x ov-ellipsis"
                            title={connectedNodeLabel(r)}
                          >
                            {connectedNodeLabel(r)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="ov-list">
                    {connected.map((r) => {
                      const seed =
                        r.kind === "file"
                          ? r.id.startsWith("file:")
                            ? r.id.slice("file:".length)
                            : r.label
                          : undefined;
                      const open = (): void => {
                        props.onOpenBlast?.(seed);
                      };
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className="ov-list__row ov-list__row--btn"
                          onClick={open}
                          disabled={!props.onOpenBlast}
                          title={`Open blast radius for ${connectedNodeLabel(r)}`}
                        >
                          <span
                            className="ov-dot"
                            style={{ background: r.color }}
                          />
                          <span
                            className="ov-mono ov-ellipsis"
                            title={connectedNodeLabel(r)}
                          >
                            {connectedNodeLabel(r)}
                          </span>
                          <span className="ov-list__badge">
                            {r.degree} links
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="ov-empty">
                  No dependency edges in the current map zoom — try opening the
                  Repository Map.
                </p>
              )}
            </article>

            <article className="ov-card">
              <div className="ov-card__head">
                <span className="ov-card__title">
                  <Clock size={14} className="ov-card__icon" aria-hidden />
                  Recent Activity
                </span>
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

/** Circular health gauge (SVG donut). */
/**
 * `score` is null while health is unknown. It previously defaulted to 0, which
 * rendered a full red ring reading 0/100 — a failing grade for a repository
 * Prism had simply not scored yet (ADR-0029).
 */
function HealthRing(props: { score: number | null }): ReactElement {
  const r = 22;
  const c = 2 * Math.PI * r;
  const known = props.score !== null;
  const offset = known ? c * (1 - props.score! / 100) : c;
  const color = known ? scoreColor(props.score!) : "#5A6B76";
  return (
    <div className="ov-ring" data-no-data={!known}>
      {!known ? (
        <span className="ov-sr">Health score not computed yet</span>
      ) : null}
      <svg viewBox="0 0 56 56" className="ov-ring__svg" aria-hidden>
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="#2A334A"
          strokeWidth="5"
          {...(known ? {} : { strokeDasharray: "3 4" })}
        />
        {known ? (
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 28 28)"
          />
        ) : null}
      </svg>
      <span className="ov-ring__label" style={{ color }}>
        {known ? props.score : "—"}
      </span>
    </div>
  );
}

/** Format a bucket start (UTC epoch-ms) for the hover tooltip. */
function bucketLabel(ms: number, granularity: "day" | "week"): string {
  const d = new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return granularity === "week" ? `Week of ${d}` : d;
}

/** Real commit-activity area chart derived from git day/week buckets. */
function ActivityChart(props: {
  values: number[];
  starts: number[];
  granularity: "day" | "week";
  total: number;
}): ReactElement {
  const w = 600;
  const h = 180;
  const pad = 8;
  const sparkId = useId();
  const { line, area } = activityGeometry(props.values, w, h, pad);
  const unit = props.granularity === "day" ? "day" : "week";

  const n = props.values.length;
  const max = Math.max(1, ...props.values);
  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const points = props.values.map((v, i) => ({
    x: pad + i * stepX,
    y: h - pad - (v / max) * (h - pad * 2),
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

  const idx = Math.max(0, Math.min(hover ?? lastIndex, n - 1));
  const hp = points[idx];
  const leftPct = hp ? (hp.x / w) * 100 : 0;
  const visible = hover !== null && hp !== undefined;

  return (
    <div className="ov-chart">
      <div
        ref={plotRef}
        className="ov-chart__plot"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="ov-chart__svg"
          aria-hidden
        >
          <defs>
            {/* Instance-scoped: two charts on one page with the same gradient
                id is a duplicate DOM id, and the second chart then paints with
                the first one's fill. */}
            <linearGradient id={sparkId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,194,194,0.35)" />
              <stop offset="100%" stopColor="rgba(0,194,194,0)" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${sparkId})`} />
          <polyline
            points={line}
            fill="none"
            stroke="#00C2C2"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

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
              style={{ left: `${leftPct}%`, top: `${hp.y}px` }}
              aria-hidden
            />
            <div
              className="ov-chart__tip"
              data-visible={visible ? "true" : "false"}
              style={{ left: `${leftPct}%` }}
              role="status"
            >
              <strong>{props.values[idx]}</strong> commit
              {props.values[idx] === 1 ? "" : "s"}
              <span className="ov-chart__tip-date">
                {bucketLabel(props.starts[idx] ?? 0, props.granularity)}
              </span>
            </div>
          </>
        ) : null}
      </div>
      <div className="ov-chart__legend">
        <span>
          <span className="ov-dot" style={{ background: "#00C2C2" }} /> Commits
          / {unit}
        </span>
        <span className="ov-chart__total">{props.total} commits in window</span>
      </div>
    </div>
  );
}
