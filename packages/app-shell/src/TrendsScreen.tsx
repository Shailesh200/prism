import type {
  GitActivity,
  GitAuthorRollup,
  GitRecentFile,
  HealthHistoryBackfillStatus,
  HealthHistoryPoint,
  HealthScore,
  RegionMoversReport,
  RepositoryMap,
  SignalProvenance,
} from "@repo-prism/shared";
import { DEFAULT_PROVENANCE } from "@repo-prism/shared";
import {
  AreaChart,
  CartesianFrame,
  DateRangePicker,
  InfoTip,
  chartTipEdge,
  pickAxisIndices,
  type DateRangeValue,
  Text,
} from "@repo-prism/ui";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { Avatar } from "./Avatar.js";
import {
  ACTIVITY_RANGES,
  activityGeometry,
  bucketActivity,
  DEFAULT_ACTIVITY_RANGE,
  presetBounds,
} from "./overview-model.js";
import type { GitStatus } from "./OverviewScreen.js";

export type TrendsScreenProps = {
  map: RepositoryMap | null;
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  gitActivity: GitActivity | null;
  gitStatus?: GitStatus;
  /** Live health score from Core (Overview still shows it). */
  health?: HealthScore | null;
  /** Optional preloaded health history; otherwise fetched via client props. */
  healthHistory?: { points: HealthHistoryPoint[] } | null;
  regionMovers?: RegionMoversReport | null;
  onNavigate: (view: AppView) => void;
  fetchHealthHistory?: () => Promise<{ points: HealthHistoryPoint[] }>;
  fetchRegionMovers?: () => Promise<RegionMoversReport>;
  startHealthHistoryBackfill?: () => Promise<void>;
  fetchHealthHistoryBackfillStatus?: () => Promise<HealthHistoryBackfillStatus>;
  onNotify?: (
    message: string,
    tone?: "ok" | "error" | "info" | "warning",
  ) => void;
  readonly workspacePath?: string;
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
  });
  return granularity === "week" ? `Week of ${d}` : d;
}

function axisDateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
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
  /** When false, stay at the frame height instead of flex-filling the page. */
  fill?: boolean;
  /**
   * Per-point origin, parallel to `values`. Estimated points are drawn hollow
   * and labelled in the tooltip so a backfilled score is never mistaken for one
   * measured at that commit (ADR-0029).
   */
  pointProvenance?: readonly SignalProvenance[];
  /**
   * Explicit y-axis domain. Score series pass 0–100 so a flat 50 renders at
   * mid-height; the default (0..series max) suits unbounded counts.
   */
  minValue?: number;
  maxValue?: number;
}): ReactElement {
  const w = 600;
  const h = 200;
  const pad = 10;
  const { points: geometryPoints } = activityGeometry(props.values, w, h, pad, {
    min: props.minValue,
    max: props.maxValue,
  });
  const n = props.values.length;
  const points = geometryPoints.map(([x, y]) => ({ x, y }));

  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [lastIndex, setLastIndex] = useState(0);

  const yMin = props.minValue ?? 0;
  const yMax = props.maxValue ?? Math.max(1, ...props.values);
  const xLabels = pickAxisIndices(n).map((i) => ({
    fraction: (points[i]?.x ?? 0) / w,
    label: axisDateLabel(props.starts[i] ?? 0),
  }));

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
  const hoveredProvenance: SignalProvenance | undefined =
    props.pointProvenance?.[idx];
  // Heuristic points (pre-ADR-0029 cached history) get the same hollow
  // treatment as estimated ones — neither was measured at the plotted commit.
  const hoveredApproximate =
    hoveredProvenance === "estimated" || hoveredProvenance === "heuristic";
  const estimatedCount =
    props.pointProvenance?.filter((p) => p === "estimated").length ?? 0;
  const heuristicCount =
    props.pointProvenance?.filter((p) => p === "heuristic").length ?? 0;
  // Center the guide/point/tip when there is only one point (no line to trace).
  const leftPct = n === 1 ? 50 : hp ? (hp.x / w) * 100 : 0;
  const tipEdge = chartTipEdge(leftPct / 100);
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
        })
      : bucketLabel(
          props.starts[idx] ?? 0,
          props.granularity === "week" ? "week" : "day",
        );

  return (
    <div className={props.fill === false ? "ov-chart" : "ov-chart tr-chart"}>
      <CartesianFrame
        width={w}
        height={h}
        pad={pad}
        min={yMin}
        max={yMax}
        integerY={props.maxValue === undefined}
        xLabels={xLabels}
      >
        <div
          ref={plotRef}
          className="ov-chart__plot"
          tabIndex={0}
          role="img"
          aria-label={props.totalLabel}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          <AreaChart
            values={props.values}
            width={w}
            height={h}
            label={props.totalLabel}
            className="ov-chart__svg"
            pad={pad}
            {...(props.minValue !== undefined
              ? { minValue: props.minValue }
              : {})}
            {...(props.maxValue !== undefined
              ? { maxValue: props.maxValue }
              : {})}
          />
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
                data-estimated={hoveredApproximate ? "true" : "false"}
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
                <strong>
                  {props.values[idx]}
                  {props.valueSuffix ?? ""}
                </strong>
                <span className="ov-chart__tip-date">{tipDate}</span>
                {hoveredApproximate ? (
                  <span className="ov-chart__tip-note">
                    {hoveredProvenance === "heuristic"
                      ? "Heuristic — older cached score, not measured at that commit"
                      : "Estimated — scored from the current tree"}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </CartesianFrame>
      <div className="ov-chart__legend">
        <span>
          <span className="ov-dot" style={{ background: "#00C2C2" }} />{" "}
          {props.unitLabel}
        </span>
        {estimatedCount > 0 ? (
          <span className="ov-chart__estimated">
            <span className="ov-dot ov-dot--hollow" />{" "}
            {`${estimatedCount} estimated`}
          </span>
        ) : null}
        {heuristicCount > 0 ? (
          <span className="ov-chart__estimated">
            <span className="ov-dot ov-dot--hollow" />{" "}
            {`${heuristicCount} heuristic`}
          </span>
        ) : null}
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
  const w = 600;
  const h = 200;
  const pad = 10;
  const max = Math.max(1, ...props.values);
  const n = props.values.length;
  const [hover, setHover] = useState<number | null>(null);
  const step = n > 40 ? Math.ceil(n / 40) : 1;
  const shown = props.values
    .map((v, i) => ({ v, i }))
    .filter((_, idx) => idx % step === 0);
  const xLabels = pickAxisIndices(shown.length).map((shownIdx) => {
    const i = shown[shownIdx]?.i ?? 0;
    const frac =
      shown.length > 1
        ? pad / w + (shownIdx / (shown.length - 1)) * (1 - (pad * 2) / w)
        : 0.5;
    return {
      fraction: frac,
      label: axisDateLabel(props.starts[i] ?? 0),
    };
  });
  const hovered = hover === null ? null : shown[hover];
  const hoverFrac =
    shown.length > 0 ? ((hover ?? 0) + 0.5) / shown.length : 0.5;
  const tipEdge = chartTipEdge(hoverFrac);

  if (n === 0) {
    return <p className="ov-empty">No commit volume in this range.</p>;
  }

  return (
    <div className="ov-chart tr-chart">
      <CartesianFrame
        width={w}
        height={h}
        pad={pad}
        min={0}
        max={max}
        integerY
        xLabels={xLabels}
      >
        <div
          className="tr-bars ov-chart__plot"
          role="img"
          aria-label="Commit volume by period"
          onMouseLeave={() => setHover(null)}
        >
          {shown.map(({ v, i }, shownIdx) => {
            const barH = Math.max(2, Math.round((v / max) * 100));
            return (
              <button
                key={props.starts[i] ?? i}
                type="button"
                className="tr-bars__col"
                data-active={hover === shownIdx ? "true" : "false"}
                onMouseEnter={() => setHover(shownIdx)}
                onFocus={() => setHover(shownIdx)}
                onBlur={() => setHover(null)}
                aria-label={`${bucketLabel(props.starts[i] ?? 0, props.granularity)}: ${v} commits`}
              >
                <span
                  className="tr-bars__fill"
                  style={{ height: `${barH}%` }}
                />
              </button>
            );
          })}
          {hovered ? (
            <div
              className="ov-chart__tip"
              data-visible="true"
              {...(tipEdge ? { "data-edge": tipEdge } : {})}
              style={{
                left: `${hoverFrac * 100}%`,
                top: `${100 - Math.max(2, Math.round((hovered.v / max) * 100))}%`,
              }}
              role="status"
            >
              <strong>{hovered.v}</strong>
              <span className="ov-chart__tip-date">
                {axisDateLabel(props.starts[hovered.i] ?? 0)}
              </span>
            </div>
          ) : null}
        </div>
      </CartesianFrame>
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
            No health history yet, so region movers can&apos;t be computed.
            Build history from local git to seed a baseline to compare against.
          </p>
          {props.onSync ? (
            <button
              type="button"
              className="tr-sync__btn"
              onClick={props.onSync}
              disabled={props.syncing}
            >
              {props.syncing ? (
                <Loader2 className="prism-spinner" size={14} aria-hidden />
              ) : null}
              Build history
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

  const [nowMs] = useState(() => Date.now());
  const [range, setRange] = useState<DateRangeValue>(() => {
    const preset =
      ACTIVITY_RANGES.find((r) => r.id === DEFAULT_ACTIVITY_RANGE) ??
      ACTIVITY_RANGES[0]!;
    const bounds = presetBounds(preset.days, Date.now());
    return {
      preset: preset.id,
      startMs: bounds.startMs,
      endMs: bounds.endMs,
    };
  });

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

  const windowBounds = useMemo(
    () => ({ startMs: range.startMs, endMs: range.endMs }),
    [range.startMs, range.endMs],
  );

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
    gitStatus === "unavailable" ||
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
  // History cached before ADR-0029 has no provenance; read it as heuristic
  // rather than claiming it was measured.
  const healthProvenance: SignalProvenance[] = rangedHealth.map(
    (p) => p.provenance ?? DEFAULT_PROVENANCE,
  );

  const loadHistory = useCallback(async (): Promise<void> => {
    try {
      if (props.fetchHealthHistory) {
        const hist = await props.fetchHealthHistory();
        setHistoryPoints(hist.points);
        setHistoryError(null);
      } else if (props.healthHistory) {
        setHistoryPoints(props.healthHistory.points);
      }
      if (props.fetchRegionMovers) {
        try {
          const next = await props.fetchRegionMovers();
          setMovers(next);
        } catch {
          setMovers(null);
        }
      } else if (props.regionMovers) {
        setMovers(props.regionMovers);
      }
      if (props.fetchHealthHistoryBackfillStatus) {
        const status = await props.fetchHealthHistoryBackfillStatus();
        setBackfill(status);
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    }
  }, [
    props.fetchHealthHistory,
    props.fetchRegionMovers,
    props.fetchHealthHistoryBackfillStatus,
    props.healthHistory,
    props.regionMovers,
  ]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!props.fetchHealthHistoryBackfillStatus) return;
    if (backfill?.status !== "running") return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const status = await props.fetchHealthHistoryBackfillStatus!();
        if (cancelled) return;
        setBackfill(status);
        if (status.status === "done") {
          await loadHistory();
          if (!cancelled) setSyncing(false);
        }
        if (status.status === "error" || status.status === "done") {
          if (!cancelled) setSyncing(false);
          if (status.status === "error") {
            props.onNotify?.(status.message, "error");
          } else if (status.message) {
            props.onNotify?.(status.message, "ok");
          }
        }
      } catch {
        if (!cancelled) setSyncing(false);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 800);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    backfill?.status,
    loadHistory,
    props.fetchHealthHistoryBackfillStatus,
    props.onNotify,
  ]);

  const startBackfill = async (): Promise<void> => {
    if (!props.startHealthHistoryBackfill) {
      setHistoryError("History sync is not available in this host yet.");
      props.onNotify?.(
        "History sync is not available in this host yet.",
        "error",
      );
      return;
    }
    setSyncing(true);
    setHistoryError(null);
    props.onNotify?.("Building health history from git…", "info");
    try {
      await props.startHealthHistoryBackfill();
      if (!props.fetchHealthHistoryBackfillStatus) {
        setBackfill({
          status: "running",
          progress: 0,
          message: "History sync in progress…",
        });
        props.onNotify?.("Health history is building.", "ok");
        return;
      }
      const status = await props.fetchHealthHistoryBackfillStatus();
      setBackfill(status);
      if (status.status === "error") {
        setSyncing(false);
        props.onNotify?.(status.message, "error");
        return;
      }
      if (status.status === "done") {
        setSyncing(false);
        await loadHistory();
        props.onNotify?.(status.message || "Health history is ready.", "ok");
        return;
      }
      props.onNotify?.("Health history is building.", "ok");
    } catch (err) {
      setSyncing(false);
      const message = err instanceof Error ? err.message : String(err);
      setHistoryError(message);
      props.onNotify?.(message, "error");
    }
  };

  const backfillPct = Math.round((backfill?.progress ?? 0) * 100);
  const showBackfillCta =
    rangedHealth.length === 0 &&
    (historyPoints.length === 0 || backfill?.status === "running");

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="trends"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <Text variant="page" as="div" className="ov-top__title">
              Trends
            </Text>
            <Text variant="caption" as="div" className="ov-top__sub">
              {subtitle || "Local repository"}
            </Text>
          </div>
          <div className="ov-top__actions">
            <DateRangePicker
              aria-label="Time range"
              className="ov-range"
              presets={ACTIVITY_RANGES.map((r) => ({
                id: r.id,
                label: r.label,
                shortLabel: r.label,
              }))}
              value={range}
              nowMs={nowMs}
              presetWindow={(id, at) => {
                const preset =
                  ACTIVITY_RANGES.find((row) => row.id === id) ??
                  ACTIVITY_RANGES[0]!;
                return presetBounds(preset.days, at);
              }}
              onChange={setRange}
            />
          </div>
        </header>

        <div className="ov-scroll tr-scroll">
          <section className="ov-card tr-panel tr-panel--wide">
            <div className="ov-card__head">
              <Text variant="card" as="h2" className="ov-card__title">
                Health over time
                <InfoTip label="Health over time">
                  Historical health scores from Prism snapshots and optional git
                  commit backfill.
                </InfoTip>
              </Text>
              <div className="tr-legend">
                <span>
                  <span className="ov-dot" style={{ background: "#00C2C2" }} />{" "}
                  Overall
                </span>
              </div>
            </div>
            {historyError ? (
              <div>
                <p className="ov-empty">{historyError}</p>
                <button
                  type="button"
                  className="ov-btn ov-btn--primary"
                  onClick={() => void loadHistory()}
                >
                  Try again
                </button>
              </div>
            ) : showBackfillCta ? (
              <div className="tr-sync">
                {backfill?.status === "running" ||
                (syncing && backfill?.status !== "error") ? (
                  <p className="tr-sync__status">
                    History sync in progress… {backfillPct}%
                    {backfill?.message ? ` — ${backfill.message}` : ""}
                  </p>
                ) : (
                  <>
                    {backfill?.status === "error" ? (
                      <p className="ov-empty">{backfill.message}</p>
                    ) : (
                      <p className="tr-empty__body">
                        No historical health series for this range yet. Build
                        history from local git to seed approximate scores.
                      </p>
                    )}
                    <button
                      type="button"
                      className="tr-sync__btn"
                      onClick={() => void startBackfill()}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <Loader2
                          className="prism-spinner"
                          size={14}
                          aria-hidden
                        />
                      ) : null}
                      Build history
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
                pointProvenance={healthProvenance}
                minValue={0}
                maxValue={100}
              />
            )}
          </section>

          <div className="tr-grid-charts tr-grid-charts--secondary">
            <section className="ov-card tr-panel">
              <div className="ov-card__head">
                <Text variant="card" as="h2" className="ov-card__title">
                  Commit volume
                  <InfoTip label="Commit volume">
                    Commits per day or week from local git day buckets in the
                    selected range.
                  </InfoTip>
                </Text>
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
                <Text variant="card" as="h2" className="ov-card__title">
                  Authors
                  <InfoTip label="Authors">
                    Full author census from local git history, ranked by
                    commits.
                  </InfoTip>
                </Text>
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
                <Text variant="card" as="h2" className="ov-card__title">
                  Churn hotspots
                  <InfoTip label="Churn hotspots">
                    Top files by commit count from recent git activity.
                    +Adds/−Dels bars show line churn of the most recent commit
                    that touched each file (not cumulative window churn).
                  </InfoTip>
                </Text>
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
                  <Text variant="card" as="h2" className="ov-card__title">
                    Improving regions
                    <InfoTip label="Improving regions">
                      Regions whose health score rose between the oldest and
                      newest history snapshots.
                    </InfoTip>
                  </Text>
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
                  <Text variant="card" as="h2" className="ov-card__title">
                    Regressing regions
                    <InfoTip label="Regressing regions">
                      Regions whose health score fell between the oldest and
                      newest history snapshots.
                    </InfoTip>
                  </Text>
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
