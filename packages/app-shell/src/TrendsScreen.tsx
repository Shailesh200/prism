import type {
  GitActivity,
  GitAuthorRollup,
  GitRecentFile,
  HealthHistoryBackfillStatus,
  HealthHistoryPoint,
  HealthScore,
  RegionMoversReport,
  RepositoryMap,
} from "@prism/shared";
import { InfoTip } from "@prism/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { Avatar } from "./Avatar.js";
import {
  ACTIVITY_RANGES,
  activityGeometry,
  bucketActivity,
  DEFAULT_ACTIVITY_RANGE,
  parseDayMs,
  presetBounds,
  type ActivityRangeId,
} from "./overview-model.js";

export type TrendsScreenProps = {
  map: RepositoryMap | null;
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  gitActivity: GitActivity | null;
  gitStatus?: "loading" | "ready" | "error";
  /** Live health score from Core (preferred for Current Health Score KPI). */
  health?: HealthScore | null;
  /** Optional preloaded health history; otherwise fetched via client props. */
  healthHistory?: { points: HealthHistoryPoint[] } | null;
  regionMovers?: RegionMoversReport | null;
  onNavigate: (view: AppView) => void;
  fetchHealthHistory?: () => Promise<{ points: HealthHistoryPoint[] }>;
  fetchRegionMovers?: () => Promise<RegionMoversReport>;
  startHealthHistoryBackfill?: () => Promise<void>;
  fetchHealthHistoryBackfillStatus?: () => Promise<HealthHistoryBackfillStatus>;
};

type AuthorRow = {
  name: string;
  email?: string | undefined;
  commits: number;
};

function bucketLabel(ms: number, granularity: "day" | "week"): string {
  const d = new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return granularity === "week" ? `Week of ${d}` : d;
}

function churnWidths(adds: number, dels: number): { add: number; del: number } {
  const max = Math.max(1, adds, dels);
  return {
    add: Math.max(4, Math.round((adds / max) * 48)),
    del: Math.max(4, Math.round((dels / max) * 48)),
  };
}

function authorsInWindow(
  authors: readonly GitAuthorRollup[] | undefined,
  recentCommits: GitActivity["recentCommits"],
  startMs: number,
  endMs: number,
): AuthorRow[] {
  // Prefer full census from Core; fall back to recent-commits sample.
  if (authors && authors.length > 0) {
    return authors
      .map((a) => ({
        name: a.name,
        email: a.email,
        commits: a.commits,
      }))
      .sort((a, b) => b.commits - a.commits);
  }
  const by = new Map<string, AuthorRow>();
  for (const c of recentCommits) {
    const ms = Date.parse(c.date);
    if (!Number.isFinite(ms) || ms < startMs || ms > endMs + 86_400_000 - 1) {
      continue;
    }
    const key = (c.email || c.author).toLowerCase();
    const prev = by.get(key);
    if (prev) {
      prev.commits += 1;
    } else {
      by.set(key, {
        name: c.author,
        email: c.email,
        commits: 1,
      });
    }
  }
  return [...by.values()].sort((a, b) => b.commits - a.commits);
}

function filterHealthPoints(
  points: readonly HealthHistoryPoint[],
  startMs: number,
  endMs: number,
): HealthHistoryPoint[] {
  return points.filter((p) => {
    const ms = Date.parse(p.at);
    return Number.isFinite(ms) && ms >= startMs && ms <= endMs + 86_400_000 - 1;
  });
}

/** Interactive area chart shared by commit activity + health history. */
function SeriesAreaChart(props: {
  values: number[];
  starts: number[];
  granularity: "day" | "week" | "point";
  totalLabel: string;
  unitLabel: string;
  valueSuffix?: string;
  emptyMessage: string;
  gradientId: string;
}): ReactElement {
  const w = 600;
  const h = 200;
  const pad = 10;
  const { line, area } = activityGeometry(props.values, w, h, pad);
  const n = props.values.length;
  const max = Math.max(1, ...props.values);
  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const points = props.values.map((v, i) => ({
    x: pad + i * stepX,
    y: h - pad - (v / max) * (h - pad * 2),
  }));

  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
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
  // Center the guide/point/tip when there is only one point (no line to trace).
  const leftPct = n === 1 ? 50 : hp ? (hp.x / w) * 100 : 0;
  const visible = hover !== null && hp !== undefined;

  if (n === 0) {
    return <p className="ov-empty">{props.emptyMessage}</p>;
  }

  // A lone data point has no line/area to draw, so plot it as a centered dot
  // marker instead of an invisible zero-length polyline.
  const singleY = points[0] ? (points[0].y / h) * 100 : 50;

  const tipDate =
    props.granularity === "point"
      ? new Date(props.starts[idx] ?? 0).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : bucketLabel(
          props.starts[idx] ?? 0,
          props.granularity === "week" ? "week" : "day",
        );

  return (
    <div className="ov-chart tr-chart">
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
            <linearGradient id={props.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,194,194,0.4)" />
              <stop offset="100%" stopColor="rgba(0,194,194,0)" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${props.gradientId})`} />
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
        {n === 1 ? (
          <span
            className="tr-chart__dot"
            style={{ left: "50%", top: `${singleY}%` }}
            aria-hidden
          />
        ) : null}
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
              <strong>
                {props.values[idx]}
                {props.valueSuffix ?? ""}
              </strong>
              <span className="ov-chart__tip-date">{tipDate}</span>
            </div>
          </>
        ) : null}
      </div>
      <div className="ov-chart__legend">
        <span>
          <span className="ov-dot" style={{ background: "#00C2C2" }} />{" "}
          {props.unitLabel}
        </span>
        <span className="ov-chart__total">{props.totalLabel}</span>
      </div>
    </div>
  );
}

/** Vertical bar chart for the same commit buckets. */
function CommitBarChart(props: {
  values: number[];
  starts: number[];
  granularity: "day" | "week";
}): ReactElement {
  const max = Math.max(1, ...props.values);
  const n = props.values.length;
  if (n === 0) {
    return <p className="ov-empty">No commit volume in this range.</p>;
  }
  const step = n > 40 ? Math.ceil(n / 40) : 1;
  const shown = props.values
    .map((v, i) => ({ v, i }))
    .filter((_, idx) => idx % step === 0);

  return (
    <div className="tr-bars" role="img" aria-label="Commit volume by period">
      {shown.map(({ v, i }) => {
        const h = Math.max(2, Math.round((v / max) * 100));
        return (
          <div
            key={props.starts[i] ?? i}
            className="tr-bars__col"
            title={`${bucketLabel(props.starts[i] ?? 0, props.granularity)}: ${v}`}
          >
            <span className="tr-bars__fill" style={{ height: `${h}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function MoverList(props: {
  items: RegionMoversReport["improving"];
  historyEmpty: boolean;
  onSync?: (() => void) | undefined;
  syncing?: boolean;
  direction: "up" | "down";
}): ReactElement {
  if (props.items.length === 0) {
    // Only prompt to sync when there is genuinely no history to compare against;
    // otherwise the regions simply didn't move in the compared snapshots.
    if (props.historyEmpty) {
      return (
        <div className="tr-movers__empty">
          <p className="tr-empty__body">
            No health history yet, so region movers can't be computed. Sync
            history from local git to seed a baseline to compare against.
          </p>
          {props.onSync ? (
            <button
              type="button"
              className="tr-sync__btn"
              onClick={props.onSync}
              disabled={props.syncing}
            >
              Sync history
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <p className="ov-empty">
        {props.direction === "up"
          ? "No regions improved between the compared snapshots."
          : "No regions regressed between the compared snapshots."}
      </p>
    );
  }
  return (
    <ul className="tr-movers__list">
      {props.items.map((m) => (
        <li key={m.id} className="tr-movers__row">
          <span className="tr-movers__label" title={m.label}>
            {m.label}
          </span>
          <span className="tr-movers__scores ov-mono">
            {Math.round(m.fromScore)} → {Math.round(m.toScore)}
          </span>
          <span
            className={`tr-movers__delta tr-movers__delta--${props.direction} ov-mono`}
          >
            {m.delta > 0 ? "+" : ""}
            {Math.round(m.delta)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TrendsScreen(props: TrendsScreenProps): ReactElement {
  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");
  const gitStatus = props.gitStatus ?? "loading";
  const days = props.gitActivity?.days ?? [];

  const [rangeId, setRangeId] = useState<ActivityRangeId>(
    DEFAULT_ACTIVITY_RANGE,
  );
  const [customStart, setCustomStart] = useState(() =>
    toDayInput(presetBounds(7).startMs),
  );
  const [customEnd, setCustomEnd] = useState(() =>
    toDayInput(presetBounds(7).endMs),
  );

  const [historyPoints, setHistoryPoints] = useState<HealthHistoryPoint[]>(
    () => props.healthHistory?.points ?? [],
  );
  const [movers, setMovers] = useState<RegionMoversReport | null>(
    () => props.regionMovers ?? null,
  );
  const [backfill, setBackfill] = useState<HealthHistoryBackfillStatus | null>(
    null,
  );
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const windowBounds = useMemo(() => {
    if (rangeId === "custom") {
      return {
        startMs: parseDayMs(customStart),
        endMs: parseDayMs(customEnd),
      };
    }
    const preset =
      ACTIVITY_RANGES.find((r) => r.id === rangeId) ??
      ACTIVITY_RANGES.find((r) => r.id === DEFAULT_ACTIVITY_RANGE)!;
    return presetBounds(preset.days);
  }, [rangeId, customStart, customEnd]);

  const activity = useMemo(
    () => bucketActivity(days, windowBounds.startMs, windowBounds.endMs),
    [days, windowBounds.startMs, windowBounds.endMs],
  );

  const authors = useMemo(
    () =>
      authorsInWindow(
        props.gitActivity?.authors,
        props.gitActivity?.recentCommits ?? [],
        windowBounds.startMs,
        windowBounds.endMs,
      ),
    [
      props.gitActivity?.authors,
      props.gitActivity?.recentCommits,
      windowBounds.startMs,
      windowBounds.endMs,
    ],
  );

  const hotspots = useMemo(() => {
    const files = props.gitActivity?.recentFiles ?? [];
    return [...files].sort((a, b) => b.commits - a.commits).slice(0, 12);
  }, [props.gitActivity?.recentFiles]);

  const maxAuthor = Math.max(1, ...authors.map((a) => a.commits));

  const AUTHORS_PER_PAGE = 8;
  const [authorPage, setAuthorPage] = useState(0);
  const authorPageCount = Math.max(
    1,
    Math.ceil(authors.length / AUTHORS_PER_PAGE),
  );
  // Keep the page in range as the window/authors change.
  useEffect(() => {
    setAuthorPage((p) => Math.min(p, authorPageCount - 1));
  }, [authorPageCount]);
  const authorPageSafe = Math.min(authorPage, authorPageCount - 1);
  const authorStart = authorPageSafe * AUTHORS_PER_PAGE;
  const pagedAuthors = authors.slice(
    authorStart,
    authorStart + AUTHORS_PER_PAGE,
  );

  const gitUnavailable =
    gitStatus === "error" ||
    (props.gitActivity !== null && !props.gitActivity.available);

  const rangedHealth = useMemo(
    () =>
      filterHealthPoints(
        historyPoints,
        windowBounds.startMs,
        windowBounds.endMs,
      ),
    [historyPoints, windowBounds.startMs, windowBounds.endMs],
  );

  const healthValues = rangedHealth.map((p) => Math.round(p.score));
  const healthStarts = rangedHealth.map((p) => Date.parse(p.at));

  const currentHealthScore = useMemo(() => {
    if (typeof props.health?.score === "number") {
      return Math.round(props.health.score);
    }
    if (historyPoints.length === 0) return null;
    let latest = historyPoints[0]!;
    for (const p of historyPoints) {
      if (Date.parse(p.at) >= Date.parse(latest.at)) latest = p;
    }
    return Math.round(latest.score);
  }, [props.health?.score, historyPoints]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        if (props.fetchHealthHistory) {
          const hist = await props.fetchHealthHistory();
          if (!cancelled) {
            setHistoryPoints(hist.points);
            setHistoryError(null);
          }
        } else if (props.healthHistory) {
          if (!cancelled) setHistoryPoints(props.healthHistory.points);
        }
        if (props.fetchRegionMovers) {
          const next = await props.fetchRegionMovers();
          if (!cancelled) setMovers(next);
        } else if (props.regionMovers) {
          if (!cancelled) setMovers(props.regionMovers);
        }
        if (props.fetchHealthHistoryBackfillStatus) {
          const status = await props.fetchHealthHistoryBackfillStatus();
          if (!cancelled) setBackfill(status);
        }
      } catch (err) {
        if (!cancelled) {
          setHistoryError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    props.fetchHealthHistory,
    props.fetchRegionMovers,
    props.fetchHealthHistoryBackfillStatus,
    props.healthHistory,
    props.regionMovers,
  ]);

  useEffect(() => {
    if (!props.fetchHealthHistoryBackfillStatus) return;
    if (backfill?.status !== "running") return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const status = await props.fetchHealthHistoryBackfillStatus!();
        if (cancelled) return;
        setBackfill(status);
        if (status.status === "done" && props.fetchHealthHistory) {
          const hist = await props.fetchHealthHistory();
          if (!cancelled) {
            setHistoryPoints(hist.points);
            setSyncing(false);
          }
          if (props.fetchRegionMovers) {
            const next = await props.fetchRegionMovers();
            if (!cancelled) setMovers(next);
          }
        }
        if (status.status === "error" || status.status === "done") {
          setSyncing(false);
        }
      } catch {
        if (!cancelled) setSyncing(false);
      }
    };
    const id = window.setInterval(() => void tick(), 800);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    backfill?.status,
    props.fetchHealthHistoryBackfillStatus,
    props.fetchHealthHistory,
    props.fetchRegionMovers,
  ]);

  const startBackfill = async (): Promise<void> => {
    if (!props.startHealthHistoryBackfill) {
      setHistoryError("History sync is not available in this host yet.");
      return;
    }
    setSyncing(true);
    setHistoryError(null);
    try {
      await props.startHealthHistoryBackfill();
      if (props.fetchHealthHistoryBackfillStatus) {
        const status = await props.fetchHealthHistoryBackfillStatus();
        setBackfill(status);
      } else {
        setBackfill({
          status: "running",
          progress: 0,
          message: "History sync in progress…",
        });
      }
    } catch (err) {
      setSyncing(false);
      setHistoryError(err instanceof Error ? err.message : String(err));
    }
  };

  const backfillPct = Math.round((backfill?.progress ?? 0) * 100);
  const showBackfillCta =
    rangedHealth.length === 0 &&
    (historyPoints.length === 0 || backfill?.status === "running");

  return (
    <div className="ov">
      <AppSidebar
        variant="full"
        active="trends"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Trends</div>
            <div className="ov-top__sub">{subtitle || "Local repository"}</div>
          </div>
          <div className="ov-top__actions">
            <div className="ov-seg" role="group" aria-label="Time range">
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
            {rangeId === "custom" ? (
              <div className="tr-custom">
                <input
                  type="date"
                  className="tr-custom__input"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  aria-label="Range start"
                />
                <span className="tr-custom__sep">→</span>
                <input
                  type="date"
                  className="tr-custom__input"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  aria-label="Range end"
                />
              </div>
            ) : null}
          </div>
        </header>

        <div className="ov-scroll tr-scroll">
          <section className="tr-kpis" aria-label="Current metrics">
            <div className="ov-card tr-kpi">
              <div className="tr-kpi__label">
                <span>Current Health Score</span>
                <InfoTip label="Current Health Score">
                  Live Core health score when available; otherwise the latest
                  health-history snapshot.
                </InfoTip>
              </div>
              <div className="tr-kpi__row">
                <span className="tr-kpi__value">
                  {currentHealthScore === null
                    ? "—"
                    : currentHealthScore.toLocaleString()}
                </span>
                {props.health?.grade ? (
                  <span className="tr-kpi__note">
                    Grade {props.health.grade}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="ov-card tr-kpi">
              <div className="tr-kpi__label">
                <span>Commits</span>
                <InfoTip label="Commits">
                  Distinct commits in the selected window from local git day
                  buckets (getGitActivity).
                </InfoTip>
              </div>
              <div className="tr-kpi__row">
                <span className="tr-kpi__value">
                  {gitUnavailable ? "—" : activity.total.toLocaleString()}
                </span>
              </div>
            </div>
          </section>

          <div className="tr-grid-charts">
            <section className="ov-card tr-panel tr-panel--wide">
              <div className="ov-card__head">
                <h2 className="ov-card__title">
                  Health over time
                  <InfoTip label="Health over time">
                    Historical health scores from Core snapshots and optional
                    git commit backfill (ADR-0023).
                  </InfoTip>
                </h2>
                <div className="tr-legend">
                  <span>
                    <span
                      className="ov-dot"
                      style={{ background: "#00C2C2" }}
                    />{" "}
                    Overall
                  </span>
                </div>
              </div>
              {historyError ? (
                <p className="ov-empty">{historyError}</p>
              ) : showBackfillCta ? (
                <div className="tr-sync">
                  {backfill?.status === "running" || syncing ? (
                    <p className="tr-sync__status">
                      History sync in progress… {backfillPct}%
                      {backfill?.message ? ` — ${backfill.message}` : ""}
                    </p>
                  ) : (
                    <>
                      <p className="tr-empty__body">
                        No historical health series for this range yet. Sync
                        from local git history to seed approximate scores.
                      </p>
                      <button
                        type="button"
                        className="tr-sync__btn"
                        onClick={() => void startBackfill()}
                        disabled={syncing}
                      >
                        Sync history
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <SeriesAreaChart
                  values={healthValues}
                  starts={healthStarts}
                  granularity="point"
                  unitLabel="Health score"
                  totalLabel={`${rangedHealth.length} points`}
                  valueSuffix="/100"
                  emptyMessage="No health points in this range."
                  gradientId="tr-health-spark"
                />
              )}
            </section>

            <section className="ov-card tr-panel">
              <div className="ov-card__head">
                <h2 className="ov-card__title">
                  Commit activity
                  <InfoTip label="Commit activity">
                    Commits per day or week from local git day buckets in the
                    selected range.
                  </InfoTip>
                </h2>
              </div>
              {gitUnavailable ? (
                <p className="ov-empty">
                  {gitStatus === "error"
                    ? "Couldn't read local git activity."
                    : "Not a git work tree — commit trends unavailable."}
                </p>
              ) : gitStatus === "loading" && !props.gitActivity ? (
                <p className="ov-empty">Loading git activity…</p>
              ) : (
                <SeriesAreaChart
                  values={activity.buckets}
                  starts={activity.starts}
                  granularity={activity.granularity}
                  unitLabel={`Commits / ${activity.granularity === "day" ? "day" : "week"}`}
                  totalLabel={`${activity.total} in window`}
                  emptyMessage="No commit buckets in this range."
                  gradientId="tr-spark"
                />
              )}
            </section>
          </div>

          <div className="tr-grid-charts tr-grid-charts--secondary">
            <section className="ov-card tr-panel">
              <div className="ov-card__head">
                <h2 className="ov-card__title">
                  Commit volume
                  <InfoTip label="Commit volume">
                    Same commit buckets as activity, shown as a bar chart for
                    the selected range.
                  </InfoTip>
                </h2>
              </div>
              {gitUnavailable || activity.buckets.length === 0 ? (
                <p className="ov-empty">No volume data for this range.</p>
              ) : (
                <CommitBarChart
                  values={activity.buckets}
                  starts={activity.starts}
                  granularity={activity.granularity}
                />
              )}
            </section>

            <section className="ov-card tr-panel">
              <div className="ov-card__head">
                <h2 className="ov-card__title">
                  Authors
                  <InfoTip label="Authors">
                    Full author census from local git history
                    (getGitActivity.authors), ranked by commits.
                  </InfoTip>
                </h2>
              </div>
              {authors.length === 0 ? (
                <p className="ov-empty">No authors for this repository.</p>
              ) : (
                <>
                  <ul className="tr-authors">
                    {pagedAuthors.map((a) => (
                      <li
                        key={`${a.name}:${a.email ?? ""}`}
                        className="tr-authors__row"
                      >
                        <Avatar name={a.name} email={a.email} size={22} />
                        <span className="tr-authors__name" title={a.name}>
                          {a.name}
                        </span>
                        <span className="tr-authors__bar" aria-hidden>
                          <span
                            className="tr-authors__fill"
                            style={{
                              width: `${Math.round((a.commits / maxAuthor) * 100)}%`,
                            }}
                          />
                        </span>
                        <span className="ov-mono tr-authors__n">
                          {a.commits}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {authorPageCount > 1 ? (
                    <div className="tr-pager">
                      <button
                        type="button"
                        className="tr-pager__btn"
                        onClick={() => setAuthorPage((p) => Math.max(0, p - 1))}
                        disabled={authorPageSafe === 0}
                        aria-label="Previous authors"
                      >
                        <ChevronLeft size={14} aria-hidden />
                      </button>
                      <span className="tr-pager__count ov-mono">
                        {authorStart + 1}–
                        {Math.min(
                          authorStart + AUTHORS_PER_PAGE,
                          authors.length,
                        )}{" "}
                        of {authors.length}
                      </span>
                      <button
                        type="button"
                        className="tr-pager__btn"
                        onClick={() =>
                          setAuthorPage((p) =>
                            Math.min(authorPageCount - 1, p + 1),
                          )
                        }
                        disabled={authorPageSafe >= authorPageCount - 1}
                        aria-label="Next authors"
                      >
                        <ChevronRight size={14} aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>

          <div className="tr-grid-bottom">
            <section className="ov-card tr-panel">
              <div className="ov-card__head">
                <h2 className="ov-card__title">
                  Churn hotspots
                  <InfoTip label="Churn hotspots">
                    Top files by commit count from getGitActivity.recentFiles.
                    +Adds/−Dels bars show line churn of the most recent commit
                    that touched each file (not cumulative window churn).
                  </InfoTip>
                </h2>
              </div>
              {hotspots.length === 0 ? (
                <p className="ov-empty">No recent file churn available.</p>
              ) : (
                <div className="tr-table-wrap">
                  <table className="tr-table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th className="tr-table__num">Commits</th>
                        <th className="tr-table__center">+Adds / −Dels</th>
                        <th className="tr-table__center">Last author</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hotspots.map((f) => (
                        <HotspotRow key={f.path} file={f} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="tr-movers">
              <section className="ov-card tr-panel">
                <div className="ov-card__head">
                  <h2 className="ov-card__title">
                    Improving regions
                    <InfoTip label="Improving regions">
                      Regions whose health score rose between the oldest and
                      newest history snapshots.
                    </InfoTip>
                  </h2>
                </div>
                <MoverList
                  items={movers?.improving ?? []}
                  historyEmpty={historyPoints.length === 0}
                  onSync={
                    props.startHealthHistoryBackfill
                      ? () => void startBackfill()
                      : undefined
                  }
                  syncing={syncing}
                  direction="up"
                />
              </section>
              <section className="ov-card tr-panel">
                <div className="ov-card__head">
                  <h2 className="ov-card__title">
                    Regressing regions
                    <InfoTip label="Regressing regions">
                      Regions whose health score fell between the oldest and
                      newest history snapshots.
                    </InfoTip>
                  </h2>
                </div>
                <MoverList
                  items={movers?.regressing ?? []}
                  historyEmpty={historyPoints.length === 0}
                  onSync={
                    props.startHealthHistoryBackfill
                      ? () => void startBackfill()
                      : undefined
                  }
                  syncing={syncing}
                  direction="down"
                />
              </section>
            </div>
          </div>

          <p className="tr-foot">
            Commit charts and churn use local git history. Health history is
            backfilled from past commits (approximate structural health at HEAD
            stamped on historical dates until full per-commit recompute) and
            grows with each index.
          </p>
        </div>
      </div>
    </div>
  );
}

function HotspotRow(props: { file: GitRecentFile }): ReactElement {
  const { file } = props;
  const w = churnWidths(file.additions, file.deletions);
  return (
    <tr>
      <td className="ov-mono tr-table__path" title={file.path}>
        {file.path}
      </td>
      <td className="ov-mono tr-table__num">{file.commits}</td>
      <td className="tr-table__center">
        <div
          className="tr-churn"
          title={`+${file.additions} / −${file.deletions}`}
        >
          <span
            className="tr-churn__add"
            style={{ width: w.add }}
            aria-hidden
          />
          <span
            className="tr-churn__del"
            style={{ width: w.del }}
            aria-hidden
          />
        </div>
      </td>
      <td className="tr-table__center">
        <Avatar
          name={file.lastCommit.author}
          email={file.lastCommit.email}
          size={22}
        />
      </td>
    </tr>
  );
}

function toDayInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
