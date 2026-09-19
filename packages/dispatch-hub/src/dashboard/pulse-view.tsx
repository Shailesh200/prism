import {
  heartbeatAge,
  jobBadgePulse,
  jobBadgeTone,
  jobDisplayLabel,
  jobMessage,
  jobNextAction,
  type JobSummary,
} from "@repo-prism/app-shell";
import {
  AreaChart,
  Badge,
  Button,
  HoverTip,
  Truncate,
  Accordion,
  EmptyState,
  ScreenSkeleton,
  relativePrismTime,
  seriesGeometry,
} from "@repo-prism/ui";
import { CircleAlert, Inbox, Pause } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import {
  isWorkingJob,
  groupJobsByRepo,
  pulseCtaShowsCancel,
  pulseIdleRepos,
  pulseSections,
  repoInitials,
  waitWorkMeter,
  meterCaptionPlaces,
  meterHoverAt,
  pointerPercent,
  meterEndBadgeTone,
  effectiveMeterEndKind,
  pulseCostDays,
  pulseCostRangeNote,
  showWidenToAll,
  type FleetTimeRange,
  type PulseMeterKind,
  type RepoFleet,
} from "./fleet.js";
import {
  JobActions,
  jobActionHandlers,
  type JobActionHandlers,
} from "./job-actions.js";
import {
  aggregateTokensByDay,
  extremeJobsByTokens,
  formatTokenCount,
  type DayTokenBucket,
} from "./job-cost.js";

export function PulseView(
  props: {
    readonly repos: readonly RepoFleet[];
    readonly range: FleetTimeRange;
    readonly nowMs: number;
    readonly loading: boolean;
    readonly outsideCount?: number;
    readonly onShowAllTime?: () => void;
    readonly onStartJob?: () => void;
    readonly onOpenJob: (job: JobSummary) => void;
    readonly onOpenRepo: (path: string) => void;
  } & JobActionHandlers,
): ReactElement {
  const jobs = props.repos.flatMap((repo) => repo.jobs);
  const sections = pulseSections(jobs, props.range, props.nowMs);
  const idle = pulseIdleRepos(props.repos, props.range, props.nowMs);
  const costDays = pulseCostDays(props.range, props.nowMs);
  const costBuckets = aggregateTokensByDay(jobs, costDays, props.nowMs);
  const costTotal = costBuckets.reduce((sum, b) => sum + b.totalTokens, 0);
  const costJobs = costBuckets.reduce((sum, b) => sum + b.jobCount, 0);
  if (props.loading) {
    return <ScreenSkeleton label="Loading jobs…" rows={4} className="pulse" />;
  }
  const empty =
    sections.live.length === 0 &&
    sections.needsYou.length === 0 &&
    sections.settled.length === 0;
  const actions = jobActionHandlers(props);
  const outside = props.outsideCount ?? 0;
  return (
    <div className="pulse">
      {empty ? (
        <EmptyState
          className="pulse-empty"
          icon={Inbox}
          title="No data found"
          actions={
            <>
              {props.onStartJob ? (
                <Button size="sm" variant="primary" onClick={props.onStartJob}>
                  Start one
                </Button>
              ) : null}
              {showWidenToAll(outside, props.range) && props.onShowAllTime ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={props.onShowAllTime}
                >
                  Widen to All
                </Button>
              ) : null}
            </>
          }
        >
          {outside > 0
            ? `${outside} job${outside === 1 ? "" : "s"} sit outside this range.`
            : "No jobs in this range. Start one."}
        </EmptyState>
      ) : null}
      {costTotal > 0 ? (
        <TokenCostChart
          buckets={costBuckets}
          jobs={jobs}
          days={costDays}
          total={costTotal}
          jobCount={costJobs}
          nowMs={props.nowMs}
          {...(pulseCostRangeNote(props.range)
            ? { rangeNote: pulseCostRangeNote(props.range) }
            : {})}
        />
      ) : null}
      <PulseSection
        kind="live"
        hidden={sections.live.length === 0}
        count={sections.live.length}
      >
        <PulseRepoGroups
          jobs={sections.live}
          kind="live"
          nowMs={props.nowMs}
          defaultOpen
          onOpenJob={props.onOpenJob}
          {...actions}
        />
      </PulseSection>
      <PulseSection
        kind="needsYou"
        hidden={sections.needsYou.length === 0}
        count={sections.needsYou.length}
      >
        <PulseRepoGroups
          jobs={sections.needsYou}
          kind="needsYou"
          nowMs={props.nowMs}
          defaultOpen
          onOpenJob={props.onOpenJob}
          {...actions}
        />
      </PulseSection>
      <PulseSection
        kind="settled"
        hidden={sections.settled.length === 0}
        count={sections.settled.length}
      >
        <PulseRepoGroups
          jobs={sections.settled}
          kind="settled"
          nowMs={props.nowMs}
          onOpenJob={props.onOpenJob}
          {...actions}
        />
      </PulseSection>
      {idle.length > 0 ? (
        <section className="pulse-idle" aria-label="Idle repositories">
          <div className="pulse-idle__head">
            <span className="pulse-idle__label">Idle Repositories</span>
            <span className="pulse-idle__count">
              {idle.length} {idle.length === 1 ? "repository" : "repositories"}{" "}
              dormant
            </span>
          </div>
          <div className="pulse-idle__chips">
            {idle.map((repo) => {
              const since = idleSince(repo, props.nowMs);
              return (
                <button
                  key={repo.path}
                  type="button"
                  className="pulse-idle__chip"
                  onClick={() => props.onOpenRepo(repo.path)}
                >
                  <span className="pulse-mark pulse-mark--idle" aria-hidden>
                    {repoInitials(repo.label)}
                  </span>
                  <span>{repo.label}</span>
                  {since ? (
                    <span className="pulse-idle__since">· {since}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function costDayLabel(dayKey: string): string {
  const parts = dayKey.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return dayKey;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function TokenCostChart(props: {
  readonly buckets: readonly DayTokenBucket[];
  readonly jobs: readonly JobSummary[];
  readonly days: number;
  readonly total: number;
  readonly jobCount: number;
  readonly nowMs: number;
  /** Set when `days` is a display cap, not the actual selected range (e.g. "All time"). */
  readonly rangeNote?: string;
}): ReactElement {
  const width = 600;
  const height = 56;
  const pad = 4;
  const values = props.buckets.map((b) => b.totalTokens);
  const geo = seriesGeometry(values, width, height, pad);
  const plotRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | undefined>();

  const extremes = extremeJobsByTokens(props.jobs, props.days, props.nowMs);
  const peakIndex = extremes.most
    ? props.buckets.findIndex((b) => b.dayKey === extremes.most?.dayKey)
    : -1;
  const lowIndex = extremes.least
    ? props.buckets.findIndex((b) => b.dayKey === extremes.least?.dayKey)
    : -1;

  function indexFromClientX(clientX: number): number | undefined {
    const el = plotRef.current;
    if (!el || props.buckets.length === 0) return undefined;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return undefined;
    const fraction = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );
    return Math.round(fraction * (props.buckets.length - 1));
  }

  const hoverBucket =
    hoverIndex != null ? props.buckets[hoverIndex] : undefined;
  const hoverPoint = hoverIndex != null ? geo.points[hoverIndex] : undefined;
  const nearEnd = hoverIndex != null && hoverIndex >= props.buckets.length - 3;

  return (
    <Accordion
      className="pulse-cost"
      summary={
        <span className="pulse-cost__head">
          <span className="pulse-cost__label">
            Token usage · last {props.days} day{props.days === 1 ? "" : "s"}
            {props.rangeNote ? ` (${props.rangeNote})` : ""}
          </span>
          <span className="pulse-cost__total">
            {formatTokenCount(props.total)} tokens · {props.jobCount} job
            {props.jobCount === 1 ? "" : "s"}
          </span>
        </span>
      }
    >
      <div
        ref={plotRef}
        className="pulse-cost__plot"
        onMouseMove={(event) => setHoverIndex(indexFromClientX(event.clientX))}
        onMouseLeave={() => setHoverIndex(undefined)}
      >
        <AreaChart
          values={values}
          width={width}
          height={height}
          pad={pad}
          className="pulse-cost__chart"
          label={`Daily token usage over the last ${props.days} day${props.days === 1 ? "" : "s"}${props.rangeNote ? ` (${props.rangeNote})` : ""}`}
        />
        {peakIndex >= 0 && geo.points[peakIndex] && extremes.most ? (
          <span
            className="pulse-cost__mark pulse-cost__mark--peak"
            style={{
              left: `${(geo.points[peakIndex][0] / width) * 100}%`,
              top: `${(geo.points[peakIndex][1] / height) * 100}%`,
            }}
            title={`Most tokens: "${extremes.most.job.title}" · ${formatTokenCount(extremes.most.tokens)} on ${costDayLabel(extremes.most.dayKey)}`}
          />
        ) : null}
        {lowIndex >= 0 && geo.points[lowIndex] && extremes.least ? (
          <span
            className="pulse-cost__mark pulse-cost__mark--low"
            style={{
              left: `${(geo.points[lowIndex][0] / width) * 100}%`,
              top: `${(geo.points[lowIndex][1] / height) * 100}%`,
            }}
            title={`Least tokens: "${extremes.least.job.title}" · ${formatTokenCount(extremes.least.tokens)} on ${costDayLabel(extremes.least.dayKey)}`}
          />
        ) : null}
        {hoverBucket && hoverPoint ? (
          <>
            <span
              className="pulse-cost__crosshair"
              style={{ left: `${(hoverPoint[0] / width) * 100}%` }}
              aria-hidden
            />
            <span
              className={
                nearEnd
                  ? "pulse-cost__tooltip pulse-cost__tooltip--end"
                  : "pulse-cost__tooltip"
              }
              style={{ left: `${(hoverPoint[0] / width) * 100}%` }}
            >
              <strong>{costDayLabel(hoverBucket.dayKey)}</strong>
              <span>
                {formatTokenCount(hoverBucket.totalTokens)} tokens ·{" "}
                {hoverBucket.jobCount} job
                {hoverBucket.jobCount === 1 ? "" : "s"}
              </span>
            </span>
          </>
        ) : null}
      </div>
    </Accordion>
  );
}

function PulseRepoGroups(
  props: {
    readonly jobs: readonly JobSummary[];
    readonly kind: "live" | "needsYou" | "settled";
    readonly nowMs: number;
    readonly defaultOpen?: boolean;
    readonly onOpenJob: (job: JobSummary) => void;
  } & JobActionHandlers,
): ReactElement {
  const groups = groupJobsByRepo(props.jobs);
  return (
    <>
      {groups.map((group, index) => (
        <Accordion
          key={`${props.kind}:${group.path || group.label}`}
          className={`pulse-group pulse-group--${props.kind}`}
          defaultOpen={Boolean(props.defaultOpen) || index === 0}
          summary={
            <span className="repo-group-summary">
              <span className="pulse-mark" aria-hidden>
                {repoInitials(group.label)}
              </span>
              <strong>{group.label}</strong>
              <span className="repo-group-summary__chip">
                {groupChipLabel(props.kind, group.jobs)}
              </span>
            </span>
          }
        >
          {group.jobs.map((job) => (
            <PulseCard
              key={job.id}
              job={job}
              kind={props.kind}
              nowMs={props.nowMs}
              onOpenJob={props.onOpenJob}
              hideRepo
              {...jobActionHandlers(props)}
            />
          ))}
        </Accordion>
      ))}
    </>
  );
}

function PulseSection(props: {
  readonly kind: "live" | "needsYou" | "settled";
  readonly hidden: boolean;
  readonly count: number;
  readonly children: ReactNode;
}): ReactElement | null {
  if (props.hidden) return null;
  const label =
    props.kind === "live"
      ? "Live"
      : props.kind === "needsYou"
        ? "Needs you"
        : "Settled";
  return (
    <section className="pulse-section" aria-label={label}>
      <div className="pulse-section__head">
        <h2 className="pulse-section__label">
          <span
            className={`pulse-section__pip pulse-section__pip--${props.kind}`}
            aria-hidden
          />
          {label}
        </h2>
        <span
          className={`pulse-section__count pulse-section__count--${props.kind}`}
        >
          {sectionCountLabel(props.kind, props.count)}
        </span>
      </div>
      <div className="pulse-section__list">{props.children}</div>
    </section>
  );
}

function sectionCountLabel(
  kind: "live" | "needsYou" | "settled",
  count: number,
): string {
  if (kind === "live") return `${count} in progress`;
  if (kind === "needsYou") return `${count} waiting on action`;
  return `${count} recent in window`;
}

function groupChipLabel(
  kind: "live" | "needsYou" | "settled",
  jobs: readonly JobSummary[],
): string {
  if (kind === "live") return `${jobs.length} live`;
  if (kind === "settled") return `${jobs.length} finished`;
  const paused = jobs.filter((job) => job.status === "paused").length;
  if (paused === jobs.length) {
    return `${paused} paused`;
  }
  return `${jobs.length} needs you`;
}

function compactLine(
  text: string | undefined,
  maxChars = 160,
): string | undefined {
  if (!text) return undefined;
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function pulseMessage(
  job: JobSummary,
  kind: "live" | "needsYou" | "settled",
): string | undefined {
  if (kind === "needsYou") {
    return jobNextAction(job)?.copy;
  }
  const text = jobMessage(job);
  const badge = jobDisplayLabel(job);
  if (text && text.trim().toLowerCase() === badge.toLowerCase()) {
    return undefined;
  }
  return compactLine(text);
}

function useMeterWidth(): {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly width: number;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(read);
    observer.observe(el);
    read();
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function PulseCard(
  props: {
    readonly job: JobSummary;
    readonly kind: "live" | "needsYou" | "settled";
    readonly nowMs: number;
    readonly hideRepo?: boolean;
    readonly onOpenJob: (job: JobSummary) => void;
  } & JobActionHandlers,
): ReactElement {
  const job = props.job;
  const meter = waitWorkMeter(job, props.nowMs);
  const liveMeter = props.kind === "live" && jobBadgePulse(job.status);
  const meterEnd = effectiveMeterEndKind(meter.steps, job.status);
  const badgeTone = meterEnd
    ? meterEndBadgeTone(meterEnd)
    : jobBadgeTone(job.status, job.nextStep);
  const meterTotal =
    meter.waitPct + meter.workPct + meter.pausePct + meter.outcomePct;
  const paintedSteps = meter.steps.filter((step) => step.pct > 0);
  const meterBox = useMeterWidth();
  const places = meterCaptionPlaces(paintedSteps, meterBox.width);
  const hasBelow = places.some((place) => place === "below");
  const hasOn = places.some((place) => place === "on");
  const [hoverUi, setHoverUi] = useState<
    { readonly pct: number; readonly leftPx: number } | undefined
  >();
  const hover =
    hoverUi != null ? meterHoverAt(paintedSteps, hoverUi.pct) : undefined;
  const message = pulseMessage(job, props.kind);
  const mark = repoInitials(job.workspaceLabel ?? "?");
  const next = props.kind === "needsYou" ? jobNextAction(job) : undefined;
  const showCancel = Boolean(next) && pulseCtaShowsCancel(job);
  const ask = next ? pulseAsk(job, next.copy) : undefined;
  const ago = heartbeatAge(job, props.nowMs);
  const pulse = jobBadgePulse(job.status);
  return (
    <article
      className={`pulse-card pulse-card--${props.kind}`}
      data-status={job.status}
      {...(meterEnd ? { "data-meter-end": meterEnd } : {})}
      onClick={() => props.onOpenJob(job)}
    >
      <header className="pulse-card__head">
        <div className="pulse-card__lead">
          <span className="pulse-mark" aria-hidden>
            {mark}
          </span>
          <HoverTip label={job.title}>
            <strong className="pulse-card__title">
              <Truncate title={job.title}>{job.title}</Truncate>
            </strong>
          </HoverTip>
          {props.hideRepo ? null : (
            <span className="pulse-card__repo">{job.workspaceLabel}</span>
          )}
          <Badge className="pulse-card__badge" tone={badgeTone} pulse={pulse}>
            {pulse ? (
              <span className="pulse-card__live-pip" aria-hidden />
            ) : null}
            {jobDisplayLabel(job)}
          </Badge>
        </div>
        <div
          className="pulse-card__meta"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="pulse-card__id">#{job.id}</span>
          <div className="pulse-card__actions">
            <JobActions
              job={job}
              onOpenJob={props.onOpenJob}
              {...jobActionHandlers(props)}
            />
          </div>
        </div>
      </header>
      {meterTotal > 0 || isWorkingJob(job.status) ? (
        <div className="pulse-meter-wrap">
          <div
            className="pulse-meter-track"
            onMouseMove={(event) => {
              if (meterTotal <= 0) return;
              const bar = meterBox.ref.current;
              if (!bar) return;
              const barRect = bar.getBoundingClientRect();
              const trackRect = event.currentTarget.getBoundingClientRect();
              const pct = pointerPercent(event.clientX, barRect);
              setHoverUi({
                pct,
                leftPx:
                  barRect.left - trackRect.left + (pct / 100) * barRect.width,
              });
            }}
            onMouseLeave={() => setHoverUi(undefined)}
          >
            {meterTotal > 0 ? (
              <div
                ref={meterBox.ref}
                className={["pulse-meter", liveMeter ? "pulse-meter--live" : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden
              >
                {paintedSteps.map((step, index) => (
                  <span
                    key={`${step.kind}:${index}`}
                    className="pulse-meter__seg"
                    style={{ flexGrow: step.pct, flexBasis: 0 }}
                  >
                    <span className={meterFillClass(step.kind, step.live)}>
                      {liveMeter && step.kind === "work" && step.live ? (
                        <span className="pulse-meter__pip" />
                      ) : null}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            {meterTotal > 0 && hasOn ? (
              <div className="pulse-meter__overlays" aria-hidden>
                {paintedSteps.map((step, index) => (
                  <span
                    key={`${step.kind}:on:${index}`}
                    className={`pulse-meter__on-slot pulse-meter__on-slot--${step.kind}`}
                    style={{ flexGrow: step.pct, flexBasis: 0 }}
                  >
                    {places[index] === "on" ? (
                      <span className="pulse-meter__on">{step.label}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {hover && hoverUi ? (
            <span
              className={
                hoverUi.pct > 82
                  ? "pulse-card__hover-stamp pulse-card__hover-stamp--end"
                  : "pulse-card__hover-stamp"
              }
              style={{ left: hoverUi.leftPx }}
            >
              {meterStepStatusLabel(hover.kind)} · {pulseHoverStamp(hover.atMs)}
            </span>
          ) : null}
          {meterTotal > 0 && hasBelow ? (
            <div className="pulse-meter__captions" aria-hidden>
              {paintedSteps.map((step, index) => (
                <span
                  key={`${step.kind}:cap:${index}`}
                  className="pulse-meter__cap"
                  style={{ flexGrow: step.pct, flexBasis: 0 }}
                >
                  {places[index] === "below" ? (
                    <span className="pulse-meter__cap-label">{step.label}</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {message && props.kind === "live" ? (
        <div className="pulse-card__cmd">
          <span className="pulse-card__cmd-line">
            <span className="pulse-card__prompt" aria-hidden>
              $
            </span>
            <span className="pulse-card__cmd-text">{message}</span>
          </span>
          {ago ? <span className="pulse-card__ago">{ago}</span> : null}
        </div>
      ) : null}
      {ask && props.kind === "needsYou" ? (
        <div
          className={
            ask.tone === "pause"
              ? "pulse-card__ask pulse-card__ask--pause"
              : "pulse-card__ask"
          }
        >
          {ask.tone === "pause" ? (
            <Pause size={16} aria-hidden />
          ) : (
            <CircleAlert size={16} aria-hidden />
          )}
          <div className="pulse-card__ask-copy">
            <p className="pulse-card__ask-title">{ask.title}</p>
            {ask.sub ? <p className="pulse-card__ask-sub">{ask.sub}</p> : null}
          </div>
        </div>
      ) : null}
      {next ? (
        <div
          className="pulse-card__cta"
          onClick={(event) => event.stopPropagation()}
        >
          {showCancel ? (
            <Button
              size="sm"
              variant="danger"
              disabled={!props.onCancel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                props.onCancel?.(job);
              }}
            >
              Cancel
            </Button>
          ) : null}
          {next.action === "keep" ? (
            <Button
              size="sm"
              variant="primary"
              disabled={!props.onKeepAll}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                props.onKeepAll?.(job);
              }}
            >
              Keep all
            </Button>
          ) : null}
          {next.action === "resume" ? (
            <Button
              size="sm"
              variant="primary"
              disabled={
                !props.onResume ||
                (props.pending?.jobId === job.id &&
                  props.pending.action === "resume")
              }
              loading={
                props.pending?.jobId === job.id &&
                props.pending.action === "resume"
              }
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                props.onResume?.(job);
              }}
            >
              Resume
            </Button>
          ) : null}
          {next.action === "confirm" ? (
            <Button
              size="sm"
              variant="primary"
              disabled={
                !props.onConfirm ||
                (props.pending?.jobId === job.id &&
                  props.pending.action === "confirm")
              }
              loading={
                props.pending?.jobId === job.id &&
                props.pending.action === "confirm"
              }
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                props.onConfirm?.(job);
              }}
            >
              Start anyway
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function pulseAsk(
  job: JobSummary,
  copy: string,
): {
  readonly title: string;
  readonly sub?: string;
  readonly tone: "warn" | "pause";
} {
  if (job.status === "paused") {
    return { title: copy, tone: "pause" };
  }
  const dirty = job.confirm?.dirtyPaths?.length;
  if (dirty && dirty > 0) {
    return {
      title: copy,
      sub: `${dirty} modified ${dirty === 1 ? "file" : "files"} in the checkout.`,
      tone: "warn",
    };
  }
  return { title: copy, tone: "warn" };
}

function meterFillClass(
  kind: "wait" | "work" | "pause" | "error" | "cancelled",
  live: boolean,
): string {
  if (kind === "wait") return "pulse-meter__wait";
  if (kind === "work") {
    return live
      ? "pulse-meter__work pulse-meter__work--live"
      : "pulse-meter__work";
  }
  if (kind === "pause") {
    return live
      ? "pulse-meter__pause pulse-meter__pause--live"
      : "pulse-meter__pause";
  }
  if (kind === "error") return "pulse-meter__fail";
  return "pulse-meter__cancel";
}

function meterStepStatusLabel(kind: PulseMeterKind): string {
  switch (kind) {
    case "wait":
      return "Waited";
    case "work":
      return "Worked";
    case "pause":
      return "Paused";
    case "error":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "";
  }
}

function pulseHoverStamp(atMs: number): string {
  return new Date(atMs).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function idleSince(repo: RepoFleet, nowMs: number): string | undefined {
  const iso =
    repo.last?.finishedAt ?? repo.last?.updatedAt ?? repo.last?.createdAt;
  if (!iso) return undefined;
  const rel = relativePrismTime(iso, nowMs);
  if (!rel) return undefined;
  if (rel === "just now") return "just now";
  return `${rel.replace(/ ago$/, "")} idle`;
}
