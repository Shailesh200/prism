import type {
  GitActivity,
  GitRecentFile,
  HealthScore,
  RepositoryMap,
} from "@prism/shared";
import { Minus } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { Avatar } from "./Avatar.js";
import { InfoTip } from "./InfoTip.js";
import {
  ACTIVITY_RANGES,
  activityGeometry,
  bucketActivity,
  couplingBadge,
  couplingDensity,
  DEFAULT_ACTIVITY_RANGE,
  parseDayMs,
  presetBounds,
  type ActivityRangeId,
} from "./overview-model.js";
import "./overview.css";

export type TrendsScreenProps = {
  map: RepositoryMap | null;
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  gitActivity: GitActivity | null;
  gitStatus?: "loading" | "ready" | "error";
  health: HealthScore | null;
  onNavigate: (view: AppView) => void;
};

type AuthorRow = {
  author: string;
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
  commits: GitActivity["recentCommits"],
  startMs: number,
  endMs: number,
): AuthorRow[] {
  const by = new Map<string, AuthorRow>();
  for (const c of commits) {
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
        author: c.author,
        email: c.email,
        commits: 1,
      });
    }
  }
  return [...by.values()].sort((a, b) => b.commits - a.commits).slice(0, 8);
}

/** Interactive commit area chart (same geometry as Overview). */
function CommitAreaChart(props: {
  values: number[];
  starts: number[];
  granularity: "day" | "week";
  total: number;
}): ReactElement {
  const w = 600;
  const h = 200;
  const pad = 10;
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

  if (n === 0) {
    return <p className="ov-empty">No commit buckets in this range.</p>;
  }

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
            <linearGradient id="tr-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,194,194,0.4)" />
              <stop offset="100%" stopColor="rgba(0,194,194,0)" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#tr-spark)" />
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
        <span className="ov-chart__total">{props.total} in window</span>
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
  // Cap visible bars for readability on long windows.
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

function EmptySeries(props: { title: string; reason: string }): ReactElement {
  return (
    <div className="tr-empty">
      <div className="tr-empty__title">{props.title}</div>
      <p className="tr-empty__body">{props.reason}</p>
      <span className="tr-empty__badge">No data yet</span>
    </div>
  );
}

function DeltaPlaceholder(): ReactElement {
  return (
    <span className="tr-delta tr-delta--none" title="No historical baseline">
      <Minus size={12} aria-hidden />
      <span>—</span>
    </span>
  );
}

export function TrendsScreen(props: TrendsScreenProps): ReactElement {
  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");
  const gitStatus = props.gitStatus ?? "loading";
  const days = props.gitActivity?.days ?? [];
  const density = props.map ? couplingDensity(props.map.graph) : null;
  const densityBadge = density === null ? null : couplingBadge(density);
  const overall = props.health?.score;
  const testFactor = props.health?.factors.find(
    (f) => f.id === "test_presence",
  );
  const testScore =
    testFactor === undefined ? null : Math.round(testFactor.score);

  const [rangeId, setRangeId] = useState<ActivityRangeId>("3m");
  const [customStart, setCustomStart] = useState(() =>
    toDayInput(presetBounds(90).startMs),
  );
  const [customEnd, setCustomEnd] = useState(() =>
    toDayInput(presetBounds(90).endMs),
  );

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
        props.gitActivity?.recentCommits ?? [],
        windowBounds.startMs,
        windowBounds.endMs,
      ),
    [
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

  const gitUnavailable =
    gitStatus === "error" ||
    (props.gitActivity !== null && !props.gitActivity.available);

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
            <KpiTile
              label="Health Score"
              tip="Weighted 0–100 composite from Core getHealth(). Delta vs range start needs historical health snapshots (not stored yet)."
              value={overall === undefined ? "—" : String(Math.round(overall))}
            />
            <KpiTile
              label="Coupling Density"
              tip="Edges ÷ nodes on the current repository map. Live snapshot only — no historical series yet."
              value={
                density === null ? "—" : density.toFixed(density < 1 ? 2 : 1)
              }
              note={densityBadge ? densityBadge.label : undefined}
            />
            <KpiTile
              label="Test Presence"
              tip="Health factor test_presence from Core. Current score only — no delta until health history exists."
              value={testScore === null ? "—" : `${testScore}%`}
            />
            <KpiTile
              label="Commits"
              tip="Distinct commits in the selected window from local git day buckets (getGitActivity)."
              value={gitUnavailable ? "—" : activity.total.toLocaleString()}
            />
          </section>

          <div className="tr-grid-charts">
            <section className="ov-card tr-panel tr-panel--wide">
              <div className="ov-card__head">
                <h2 className="ov-card__title">Health over time</h2>
                <div className="tr-legend">
                  <span>
                    <span
                      className="ov-dot"
                      style={{ background: "#00C2C2" }}
                    />{" "}
                    Overall
                  </span>
                  <span>
                    <span
                      className="ov-dot"
                      style={{ background: "#c4c0ff" }}
                    />{" "}
                    Complexity
                  </span>
                </div>
              </div>
              <EmptySeries
                title="No historical health series"
                reason="Prism computes a live health score, but does not yet persist score snapshots over time. Commit activity below is real from local git."
              />
            </section>

            <section className="ov-card tr-panel">
              <div className="ov-card__head">
                <h2 className="ov-card__title">Commit activity</h2>
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
                <CommitAreaChart
                  values={activity.buckets}
                  starts={activity.starts}
                  granularity={activity.granularity}
                  total={activity.total}
                />
              )}
            </section>
          </div>

          <div className="tr-grid-charts tr-grid-charts--secondary">
            <section className="ov-card tr-panel">
              <div className="ov-card__head">
                <h2 className="ov-card__title">Commit volume</h2>
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
                <h2 className="ov-card__title">Authors in sample</h2>
                <InfoTip label="Authors in sample">
                  Ranked from the recent-commits sample in getGitActivity (not a
                  full-history author census). Counts are limited to commits
                  that fall inside the selected range.
                </InfoTip>
              </div>
              {authors.length === 0 ? (
                <p className="ov-empty">
                  No authors in this sample for the range.
                </p>
              ) : (
                <ul className="tr-authors">
                  {authors.map((a) => (
                    <li
                      key={`${a.author}:${a.email ?? ""}`}
                      className="tr-authors__row"
                    >
                      <Avatar name={a.author} email={a.email} size={22} />
                      <span className="tr-authors__name">{a.author}</span>
                      <span className="tr-authors__bar" aria-hidden>
                        <span
                          className="tr-authors__fill"
                          style={{
                            width: `${Math.round((a.commits / maxAuthor) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="ov-mono tr-authors__n">{a.commits}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="tr-grid-bottom">
            <section className="ov-card tr-panel">
              <div className="ov-card__head">
                <h2 className="ov-card__title">Churn hotspots</h2>
                <InfoTip label="Churn hotspots">
                  Top files by commit count from getGitActivity.recentFiles.
                  +Adds/−Dels bars show line churn of the most recent commit
                  that touched each file (not cumulative window churn).
                </InfoTip>
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
                  <h2 className="ov-card__title">Improving regions</h2>
                </div>
                <EmptySeries
                  title="Movers unavailable"
                  reason="Region health deltas need per-path historical scores. Not computed yet."
                />
              </section>
              <section className="ov-card tr-panel">
                <div className="ov-card__head">
                  <h2 className="ov-card__title">Regressing regions</h2>
                </div>
                <EmptySeries
                  title="Movers unavailable"
                  reason="Same gap — no time-series region health in Core today."
                />
              </section>
            </div>
          </div>

          <p className="tr-foot">
            Commit charts and churn use local git history. Health history and
            region movers require future Core snapshots — shown as empty until
            then.
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiTile(props: {
  label: string;
  tip: string;
  value: string;
  note?: string | undefined;
}): ReactElement {
  return (
    <div className="ov-card tr-kpi">
      <div className="tr-kpi__label">
        <span>{props.label}</span>
        <InfoTip label={props.label}>{props.tip}</InfoTip>
      </div>
      <div className="tr-kpi__row">
        <span className="tr-kpi__value">{props.value}</span>
        <DeltaPlaceholder />
      </div>
      {props.note ? <div className="tr-kpi__note">{props.note}</div> : null}
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
