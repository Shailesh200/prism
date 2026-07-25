import type {
  DnaReport,
  GitActivity,
  HealthScore,
  RepositoryMap,
  SecurityReport,
  TestingReport,
} from "@prism/shared";
import { CardIcon, relativeTime } from "@prism/ui";
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
import { InfoTip } from "@prism/ui";
import { isGitIntegrationEnabled } from "./integrations-store.js";
import { recordAudit } from "./audit-log.js";
import {
  ACTIVITY_RANGES,
  activityGeometry,
  bucketActivity,
  buildReportMarkdown,
  clampPct,
  couplingBadge as couplingBadgeFor,
  couplingDensity,
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

/** Per-health-factor accent color. */
const FACTOR_COLORS: Record<string, string> = {
  modularity: "#00C2C2",
  coupling: "#F59E0B",
  test_presence: "#6C63FF",
  parse_health: "#10B981",
  diagnostics: "#F43F5E",
};

const RECENT_PAGE_SIZE = 10;

export type OverviewScreenProps = {
  readonly map: RepositoryMap;
  readonly repoLabel: string;
  readonly gitActivity: GitActivity | null;
  readonly gitStatus?: "loading" | "ready" | "error";
  readonly health: HealthScore | null;
  readonly dna?: DnaReport | null;
  /** Optional preloaded scores from dashboard payload. */
  readonly testingScore?: number | null;
  readonly securityScore?: number | null;
  readonly onOpenMap: () => void;
  readonly onOpenDna: () => void;
  readonly onOpenProfile?: () => void;
  readonly onOpenDomains?: () => void;
  readonly onOpenTesting?: () => void;
  readonly onOpenBlast?: () => void;
  readonly onOpenTrends?: () => void;
  readonly onOpenIntegrations?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onRefresh: () => void;
  /** Re-fetch local git activity (and optionally refresh FETCH_HEAD-derived sync). */
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
    () => [...(dna?.languages ?? [])].sort((a, b) => b.share - a.share),
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

  const regions = useMemo(() => deriveRegions(map.graph), [map.graph]);
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

  const overall = health?.score ?? 0;
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
  const [syncing, setSyncing] = useState(false);

  /** Header "Last sync" = last indexed time (map generation), not git fetch. */
  const lastIndexedIso = map.generatedAt;
  const lastSyncLabel = `Last sync ${relativeTime(lastIndexedIso)}`;
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
      return "Couldn't reach local git — check the playground logs.";
    }
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

  const healthTone = overall >= 70 ? "emerald" : "amber";

  const handleDownloadReport = (): void => {
    if (typeof document === "undefined") return;
    const markdown = buildReportMarkdown({
      repoLabel: props.repoLabel,
      branch,
      generatedAtIso: map.generatedAt,
      lastSyncIso: lastIndexedIso,
      health: health
        ? {
            score: overall,
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
          else if (view === "profile") props.onOpenProfile?.();
          else if (view === "domains") props.onOpenDomains?.();
          else if (view === "blast") props.onOpenBlast?.();
          else if (view === "trends") props.onOpenTrends?.();
          else if (view === "integrations") props.onOpenIntegrations?.();
          else if (view === "settings") props.onOpenSettings?.();
        }}
      />

      {/* ---- Main ---- */}
      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Overview</div>
            <div className="ov-top__sub">
              {props.repoLabel} · {branch} · {lastSyncLabel}
            </div>
          </div>
          <div className="ov-top__actions">
            <div className="ov-top__sync">
              <button
                type="button"
                className="ov-btn ov-btn--ghost"
                onClick={handleSync}
                disabled={syncing}
                title="Refresh local git activity from the work tree"
              >
                <RefreshCw size={13} aria-hidden />
                Sync
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
                      Weighted 0–100 composite of health factors (parse health,
                      test presence, coupling, modularity, diagnostics) per
                      ADR-0012. The grade is a band over the score.
                    </InfoTip>
                  </TipGuard>
                </div>
                <div className="ov-stat__v">
                  {overall}
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
                      <span className="ov-mono">edges ÷ nodes</span> of the
                      dependency graph — the average number of dependencies per
                      module (fan-out). Lower means looser coupling; target &lt;
                      0.50. Distinct from the DNA <em>Coupling</em> factor,
                      which scores import <em>cycles</em>.
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
                    width: `${clampPct(density * 100)}%`,
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
                      Dual scores from Core <code>getTestingReport</code> and{" "}
                      <code>getSecurityReport</code>. Testing covers suite
                      diversity and coverage; Security covers left-shift tools
                      and fundamental checks.
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
                {edges.toLocaleString()} dependencies · {regions.length} regions
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
                    Per-factor health bars (the same factors as Health Score;
                    <em> Coupling</em> here scores import cycles). Open the DNA
                    Analysis view for what each factor means, its formula, and
                    concrete steps to improve.
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
                    <span>Overall DNA Score</span>
                    <strong>
                      {overall} / 100
                      {health?.grade ? (
                        <span className="ov-dna__grade">
                          Grade {health.grade}
                        </span>
                      ) : null}
                    </strong>
                  </div>
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
              <p className="ov-card__foot-note">
                Historical health trends — coming soon
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
                    A snapshot of the stack detector: language composition,
                    detected stack domains, frameworks and package manager. Open
                    for the full repository profile (frameworks, packages,
                    detection signals &amp; personas).
                  </InfoTip>
                </span>
                {props.onOpenProfile ? (
                  <button
                    type="button"
                    className="ov-card__open"
                    onClick={props.onOpenProfile}
                    aria-label="Open Codebase Profile"
                  >
                    <ArrowRight size={15} aria-hidden />
                  </button>
                ) : null}
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
                    Per region: file count (from{" "}
                    <span className="ov-mono">memberFiles</span> /{" "}
                    <span className="ov-mono">fileCount</span>) and a coupling
                    score{" "}
                    <span className="ov-mono">
                      100 − (degree ÷ maxDegree) × 55
                    </span>
                    . Empty regions without edges are omitted; all-zero degrees
                    use a mid score of 70 when files are present.
                  </InfoTip>
                </span>
              </div>
              <div className="ov-table">
                <div className="ov-table__head">
                  <span>Region</span>
                  <span className="ov-table__num">Files</span>
                  <span className="ov-table__num">Score</span>
                </div>
                {regions.map((r) => (
                  <div key={r.id} className="ov-table__row">
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
                ))}
              </div>
            </article>

            <article className="ov-card">
              <div className="ov-card__head">
                <span className="ov-card__title">
                  <Zap size={14} className="ov-card__icon" aria-hidden />
                  Most Connected
                  <InfoTip label="Most Connected">
                    Nodes ranked by total dependency degree (incoming + outgoing
                    edges) across the current map graph — a proxy for
                    blast-radius surface area.
                  </InfoTip>
                </span>
                {props.onOpenBlast ? (
                  <button
                    type="button"
                    className="ov-card__open"
                    onClick={props.onOpenBlast}
                    aria-label="Open Blast Radius"
                  >
                    <ArrowRight size={15} aria-hidden />
                  </button>
                ) : null}
              </div>
              {connected.length > 0 ? (
                <>
                  <div className="ov-bars">
                    {connected.slice(0, 3).map((r) => (
                      <div key={r.id} className="ov-bars__col">
                        <div className="ov-bars__track">
                          <span
                            className="ov-bars__fill"
                            style={{
                              height: `${(r.degree / maxDegree) * 100}%`,
                              background: r.color,
                            }}
                          />
                        </div>
                        <div className="ov-bars__x ov-ellipsis" title={r.label}>
                          {r.label}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="ov-list">
                    {connected.map((r) => (
                      <div key={r.id} className="ov-list__row">
                        <span
                          className="ov-dot"
                          style={{ background: r.color }}
                        />
                        <span className="ov-mono ov-ellipsis" title={r.label}>
                          {r.label}
                        </span>
                        <span className="ov-list__badge">{r.degree} links</span>
                      </div>
                    ))}
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
                    {pageCommits.map((commit) => (
                      <div key={commit.sha} className="ov-activity__row">
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
                    ))}
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
function HealthRing(props: { score: number }): ReactElement {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - props.score / 100);
  const color = scoreColor(props.score);
  return (
    <div className="ov-ring">
      <svg viewBox="0 0 56 56" className="ov-ring__svg" aria-hidden>
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="#2A334A"
          strokeWidth="5"
        />
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
      </svg>
      <span className="ov-ring__label" style={{ color }}>
        {props.score}
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
            <linearGradient id="ov-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,194,194,0.35)" />
              <stop offset="100%" stopColor="rgba(0,194,194,0)" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#ov-spark)" />
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
