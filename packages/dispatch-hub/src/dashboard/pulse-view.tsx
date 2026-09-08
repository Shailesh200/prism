import {
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
  formatPrismDate,
} from "@repo-prism/ui";
import { type ReactElement, type ReactNode } from "react";
import {
  jobPlaybookNotch,
  groupJobsByRepo,
  pulseIdleRepos,
  pulseSections,
  waitWorkMeter,
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
    readonly onOpenJob: (job: JobSummary) => void;
    readonly onOpenRepo: (path: string) => void;
  } & JobActionHandlers,
): ReactElement {
  const jobs = props.repos.flatMap((repo) => repo.jobs);
  const sections = pulseSections(jobs, props.range, props.nowMs);
  const idle = pulseIdleRepos(props.repos, props.range, props.nowMs);
  if (props.loading) return <div className="fleet-scan" aria-hidden />;
  const empty =
    sections.live.length === 0 &&
    sections.needsYou.length === 0 &&
    sections.settled.length === 0;
  const actions = jobActionHandlers(props);
  return (
    <div className="pulse">
      {empty ? (
        <p className="console__lede">
          No jobs in this range. Start one, or widen All.
        </p>
      ) : null}
      <PulseSection label="Live" hidden={sections.live.length === 0}>
        <PulseRepoGroups
          jobs={sections.live}
          kind="live"
          nowMs={props.nowMs}
          defaultOpen
          onOpenJob={props.onOpenJob}
          {...actions}
        />
      </PulseSection>
      <PulseSection label="Needs you" hidden={sections.needsYou.length === 0}>
        <PulseRepoGroups
          jobs={sections.needsYou}
          kind="needsYou"
          nowMs={props.nowMs}
          defaultOpen
          onOpenJob={props.onOpenJob}
          {...actions}
        />
      </PulseSection>
      <PulseSection label="Settled" hidden={sections.settled.length === 0}>
        <PulseRepoGroups
          jobs={sections.settled}
          kind="settled"
          nowMs={props.nowMs}
          onOpenJob={props.onOpenJob}
          {...actions}
        />
      </PulseSection>
      {idle.length > 0 ? (
        <div className="pulse-idle">
          <span className="pulse-idle__label">Idle</span>
          {idle.map((repo) => (
            <Button
              key={repo.path}
              size="sm"
              variant="ghost"
              onClick={() => props.onOpenRepo(repo.path)}
            >
              {repo.label}
            </Button>
          ))}
        </div>
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
          className="pulse-group"
          defaultOpen={Boolean(props.defaultOpen) || index === 0}
          summary={
            <span className="repo-group-summary">
              <span className="fleet-mark" aria-hidden>
                {group.label.slice(0, 1).toUpperCase()}
              </span>
              <strong>{group.label}</strong>
              <span className="repo-group-summary__meta">
                {group.jobs.length}{" "}
                {props.kind === "live"
                  ? "live"
                  : props.kind === "needsYou"
                    ? "need you"
                    : "settled"}
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
  readonly label: string;
  readonly hidden: boolean;
  readonly children: ReactNode;
}): ReactElement | null {
  if (props.hidden) return null;
  return (
    <section className="pulse-section" aria-label={props.label}>
      <h2 className="pulse-section__label">{props.label}</h2>
      <div className="pulse-section__list">{props.children}</div>
    </section>
  );
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
  const message = pulseMessage(job, props.kind);
  const mark = (job.workspaceLabel ?? "?").slice(0, 1).toUpperCase();
  const next = props.kind === "needsYou" ? jobNextAction(job) : undefined;
  return (
    <article
      className={`pulse-card pulse-card--${props.kind}`}
      data-notch={jobPlaybookNotch(job.playbook)}
      data-status={job.status}
      onClick={() => props.onOpenJob(job)}
    >
      <header className="pulse-card__head">
        <span className="fleet-mark" aria-hidden>
          {mark}
        </span>
        <div className="pulse-card__identity">
          <HoverTip label={job.title}>
            <strong className="pulse-card__title">
              <Truncate title={job.title}>{job.title}</Truncate>
            </strong>
          </HoverTip>
          {props.hideRepo ? null : (
            <span className="pulse-card__repo">{job.workspaceLabel}</span>
          )}
        </div>
        <Badge
          tone={jobBadgeTone(job.status, job.nextStep)}
          pulse={jobBadgePulse(job.status)}
        >
          {jobDisplayLabel(job)}
        </Badge>
        <div
          className="pulse-card__actions"
          onClick={(event) => event.stopPropagation()}
        >
          <JobActions
            job={job}
            onOpenJob={props.onOpenJob}
            {...jobActionHandlers(props)}
          />
        </div>
      </header>
      {meter.waitPct + meter.workPct + meter.outcomePct > 0 ? (
        <div className="pulse-meter-wrap">
          <div
            className={
              liveMeter ? "pulse-meter pulse-meter--live" : "pulse-meter"
            }
            aria-hidden
          >
            {meter.waitPct > 0 ? (
              <span
                className="pulse-meter__seg"
                style={{ flexGrow: meter.waitPct, flexBasis: 0 }}
              >
                <HoverTip
                  label={`Waited ${meter.waited}`}
                  {...(meterWaitDetail(job)
                    ? { detail: meterWaitDetail(job) }
                    : {})}
                >
                  <span className="pulse-meter__wait" />
                </HoverTip>
              </span>
            ) : null}
            {meter.workPct > 0 ? (
              <span
                className="pulse-meter__seg"
                style={{ flexGrow: meter.workPct, flexBasis: 0 }}
              >
                <HoverTip
                  label={`Worked ${meter.worked}`}
                  {...(meterWorkDetail(job)
                    ? { detail: meterWorkDetail(job) }
                    : {})}
                >
                  <span className="pulse-meter__work" />
                </HoverTip>
              </span>
            ) : null}
            {meter.outcome && meter.outcomePct > 0 ? (
              <span
                className="pulse-meter__seg"
                style={{ flexGrow: meter.outcomePct, flexBasis: 0 }}
              >
                <HoverTip
                  label={meter.outcome === "error" ? "Failed" : "Cancelled"}
                  {...(meterOutcomeDetail(job)
                    ? { detail: meterOutcomeDetail(job) }
                    : {})}
                >
                  <span
                    className={
                      meter.outcome === "error"
                        ? "pulse-meter__fail"
                        : "pulse-meter__cancel"
                    }
                  />
                </HoverTip>
              </span>
            ) : null}
          </div>
          <div className="pulse-meter__legend">
            <span className="pulse-meter__legend-wait">
              waited {meter.waited}
            </span>
            <span className="pulse-meter__legend-work">
              worked {meter.worked}
            </span>
            {meter.outcome ? (
              <span
                className={
                  meter.outcome === "error"
                    ? "pulse-meter__legend-fail"
                    : "pulse-meter__legend-cancel"
                }
              >
                {meter.outcome === "error" ? "failed" : "cancelled"}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {message && props.kind === "live" ? (
        <code className="pulse-card__cmd">{message}</code>
      ) : null}
      {message && props.kind !== "live" ? (
        <p className="pulse-card__copy">{message}</p>
      ) : null}
      {next ? (
        <div
          className="pulse-card__cta"
          onClick={(event) => event.stopPropagation()}
        >
          {next.action === "keep" ? (
            <Button
              size="sm"
              variant="primary"
              disabled={!props.onKeepAll}
              onClick={() => props.onKeepAll?.(job)}
            >
              Keep all
            </Button>
          ) : null}
          {next.action === "resume" ? (
            <Button
              size="sm"
              variant="primary"
              disabled={!props.onResume}
              onClick={() => props.onResume?.(job)}
            >
              Resume
            </Button>
          ) : null}
          {next.action === "confirm" ? (
            <Button
              size="sm"
              variant="primary"
              disabled={!props.onConfirm}
              onClick={() => props.onConfirm?.(job)}
            >
              Start anyway
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function stampLine(
  iso: string | undefined,
  prefix: string,
): string | undefined {
  if (!iso) return undefined;
  const label = formatPrismDate(iso, "datetime");
  return label ? `${prefix} ${label}` : undefined;
}

function meterWaitDetail(job: JobSummary): string | undefined {
  return stampLine(job.queuedAt ?? job.createdAt, "Queued");
}

function meterWorkDetail(job: JobSummary): string | undefined {
  const started = stampLine(job.startedAt, "Started");
  const finished = stampLine(job.finishedAt, "Finished");
  const parts = [started, finished].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function meterOutcomeDetail(job: JobSummary): string | undefined {
  return stampLine(job.finishedAt, "Finished");
}
