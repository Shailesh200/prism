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
  Badge,
  Button,
  HoverTip,
  Truncate,
  Accordion,
  ScreenSkeleton,
  relativePrismTime,
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
  meterEndKind,
  type FleetTimeRange,
  type RepoFleet,
} from "./fleet.js";
import {
  JobActions,
  jobActionHandlers,
  type JobActionHandlers,
} from "./job-actions.js";

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
        <div className="pulse-empty">
          <span className="pulse-empty__icon" aria-hidden>
            <Inbox size={16} />
          </span>
          <p className="pulse-empty__copy">
            {outside > 0
              ? `${outside} job${outside === 1 ? "" : "s"} sit outside this range.`
              : "No jobs in this range. Start one, or widen All."}
          </p>
          <div className="pulse-empty__actions">
            {props.onStartJob ? (
              <Button size="sm" variant="primary" onClick={props.onStartJob}>
                Start one
              </Button>
            ) : null}
            {props.onShowAllTime ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={props.onShowAllTime}
              >
                Widen to All
              </Button>
            ) : null}
          </div>
        </div>
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
            <span className="pulse-idle__label">
              Idle Repositories (No active dispatch)
            </span>
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
  const meterEnd = meterEndKind(meter.steps);
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
            {hover && hoverUi ? (
              <span
                className={
                  hoverUi.pct > 82
                    ? "pulse-card__hover pulse-card__hover--end"
                    : "pulse-card__hover"
                }
                style={{ left: hoverUi.leftPx }}
              >
                <span className="pulse-card__hover-stamp">
                  {pulseHoverStamp(hover.atMs)}
                </span>
              </span>
            ) : null}
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
