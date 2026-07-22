import type {
  DnaReport,
  GitActivity,
  HealthScore,
  RepositoryMap,
} from "@prism/shared";
import { relativeTime } from "@prism/ui";
import {
  Activity,
  ArrowRight,
  Boxes,
  Clock,
  Compass,
  Dna,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Share2,
  Zap,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { AppSidebar } from "./AppSidebar.js";
import { Avatar } from "./Avatar.js";
import { DOMAIN_CATALOG } from "./domain-catalog.js";
import { InfoTip } from "./InfoTip.js";
import {
  ACTIVITY_RANGES,
  activityGeometry,
  bucketActivity,
  clampPct,
  couplingBadge as couplingBadgeFor,
  couplingDensity,
  DEFAULT_ACTIVITY_RANGE,
  deriveRegions,
  parseDayMs,
  presetBounds,
  scoreColor,
  type ActivityRangeId,
} from "./overview-model.js";
import "./overview.css";

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

export type OverviewScreenProps = {
  readonly map: RepositoryMap;
  readonly repoLabel: string;
  readonly gitActivity: GitActivity | null;
  readonly gitStatus?: "loading" | "ready" | "error";
  readonly health: HealthScore | null;
  readonly dna?: DnaReport | null;
  readonly onOpenMap: () => void;
  readonly onOpenDna: () => void;
  readonly onOpenProfile?: () => void;
  readonly onOpenDomains?: () => void;
  readonly onOpenBlast?: () => void;
  readonly onOpenTrends?: () => void;
  readonly onOpenIntegrations?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onRefresh: () => void;
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

export function OverviewScreen(props: OverviewScreenProps): ReactElement {
  const { map, gitActivity, health, dna } = props;

  const profileLangs = useMemo(
    () => [...(dna?.languages ?? [])].sort((a, b) => b.share - a.share),
    [dna],
  );
  const profileDomains = dna?.stack?.domains ?? [];
  const primaryDomain = profileDomains[0];

  const nodes = map.graph.nodes.length;
  const edges = map.graph.edges.length;

  const regions = useMemo(() => deriveRegions(map.graph), [map.graph]);

  const density = couplingDensity(map.graph);
  const factorById = useMemo(() => {
    const m = new Map<string, HealthScore["factors"][number]>();
    for (const f of health?.factors ?? []) m.set(f.id, f);
    return m;
  }, [health]);

  const overall = health?.score ?? 0;
  const testFactor = factorById.get("test_presence")?.score;
  const testScore = testFactor === undefined ? null : Math.round(testFactor);

  const connected = [...regions]
    .sort((a, b) => b.degree - a.degree)
    .filter((r) => r.degree > 0)
    .slice(0, 5);
  const maxDegree = Math.max(1, ...connected.map((r) => r.degree));

  const recentCommits = gitActivity?.recentCommits ?? [];
  const branch = gitActivity?.summary?.branch ?? "main";
  const sync = gitActivity?.summary?.sync;
  const lastCommitDate = gitActivity?.summary?.lastDate ?? map.generatedAt;
  const lastSyncLabel = sync?.lastFetch
    ? `Last sync ${relativeTime(sync.lastFetch)}`
    : `Last commit ${relativeTime(lastCommitDate)}`;
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

  return (
    <div className="ov">
      <AppSidebar
        variant="full"
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
            <button
              type="button"
              className="ov-btn ov-btn--ghost"
              onClick={props.onRefresh}
            >
              <RefreshCw size={13} aria-hidden />
              Sync
            </button>
            <button
              type="button"
              className="ov-btn ov-btn--ghost ov-btn--soon"
              aria-disabled="true"
              title="Sharing is coming soon"
            >
              <Share2 size={13} aria-hidden />
              Share
              <span className="ov-soon">Soon</span>
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
            <article className="ov-stat ov-stat--ring">
              <HealthRing score={overall} />
              <div>
                <div className="ov-stat__k">
                  Health Score
                  <InfoTip label="Health Score">
                    Weighted 0–100 composite of health factors (parse health,
                    test presence, coupling, modularity, diagnostics) per
                    ADR-0012. The grade is a band over the score.
                  </InfoTip>
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

            <article className="ov-stat">
              <div className="ov-stat__head">
                <span className="ov-stat__k">
                  Coupling Density
                  <InfoTip label="Coupling Density">
                    <span className="ov-mono">edges ÷ nodes</span> of the
                    dependency graph — the average number of dependencies per
                    module (fan-out). Lower means looser coupling; target &lt;
                    0.50. Distinct from the DNA <em>Coupling</em> factor, which
                    scores import <em>cycles</em>.
                  </InfoTip>
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

            <article className="ov-stat">
              <div className="ov-stat__head">
                <span className="ov-stat__k">
                  Test Presence
                  <InfoTip label="Test Presence">
                    Health factor: the ratio of files with test markers to
                    source files, scaled to 0–100. Higher means more of the code
                    has associated tests.
                  </InfoTip>
                </span>
              </div>
              <div className="ov-stat__v">
                {testScore ?? "—"}
                {testScore !== null ? (
                  <span className="ov-stat__unit">/100</span>
                ) : null}
              </div>
              <div className="ov-meter">
                <span
                  className="ov-meter__fill"
                  style={{
                    width: `${testScore ?? 0}%`,
                    background: "linear-gradient(90deg,#6C63FF,#00C2C2)",
                  }}
                />
              </div>
              <div className="ov-stat__note">from local test markers</div>
            </article>

            <article className="ov-stat">
              <div className="ov-stat__head">
                <span className="ov-stat__k">
                  Graph Size
                  <InfoTip label="Graph Size">
                    Node and edge counts of the repository dependency graph,
                    plus the number of derived regions (feature/package/folder
                    groupings).
                  </InfoTip>
                </span>
                <Boxes size={14} className="ov-stat__icon" aria-hidden />
              </div>
              <div className="ov-stat__v">{nodes.toLocaleString()}</div>
              <div className="ov-stat__note">
                {edges.toLocaleString()} dependencies · {regions.length} regions
              </div>
            </article>
          </section>

          {/* Middle: DNA + Activity */}
          <section className="ov-grid ov-grid--3">
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

            <article className="ov-card ov-card--2">
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
                        {primaryDomain ? profileTitleCase(primaryDomain) : "—"}
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
                    {DOMAIN_CATALOG.map((d) => {
                      const detected = profileDomains.includes(d.id);
                      const Icon = d.icon;
                      return (
                        <span
                          key={d.id}
                          className="ov-domains__chip"
                          data-on={detected ? "true" : "false"}
                          title={
                            detected
                              ? `${d.shortLabel} detected`
                              : `${d.shortLabel} not detected`
                          }
                        >
                          <Icon size={12} aria-hidden />
                          {d.shortLabel}
                        </span>
                      );
                    })}
                  </div>
                  <p className="ov-domains__note">
                    {profileDomains.length} detected · open to explore
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
                    Per region: file count and a heuristic score{" "}
                    <span className="ov-mono">
                      100 − (degree ÷ maxDegree) × 55
                    </span>
                    . More incoming/outgoing edges lower the score.
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
                      style={{ color: scoreColor(r.score) }}
                    >
                      {r.score}
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
                    Regions ranked by total dependency degree (incoming +
                    outgoing edges) — a proxy for blast-radius surface area.
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
                <p className="ov-empty">No dependency edges to rank yet.</p>
              )}
            </article>

            <article className="ov-card">
              <div className="ov-card__head">
                <span className="ov-card__title">
                  <Clock size={14} className="ov-card__icon" aria-hidden />
                  Recent Activity
                </span>
                {sync ? (
                  <span
                    className="ov-sync"
                    title={
                      sync.upstream
                        ? `Tracking ${sync.upstream}`
                        : "No upstream configured"
                    }
                  >
                    <span
                      className="ov-sync__stat"
                      data-on={sync.ahead > 0 ? "true" : "false"}
                    >
                      ↑{sync.ahead}
                    </span>
                    <span
                      className="ov-sync__stat"
                      data-on={sync.behind > 0 ? "true" : "false"}
                    >
                      ↓{sync.behind}
                    </span>
                  </span>
                ) : (
                  <span className="ov-card__meta">local git</span>
                )}
              </div>
              {recentCommits.length > 0 ? (
                <>
                  <div className="ov-activity">
                    {recentCommits.slice(0, 7).map((commit) => (
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="ov-card__foot-note">
                    {sync?.lastFetch
                      ? `Last fetch ${relativeTime(sync.lastFetch)}`
                      : "No fetch recorded — commits shown are local history"}
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
