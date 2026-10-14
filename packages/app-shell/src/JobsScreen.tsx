import {
  Badge,
  Button,
  DateRangePicker,
  EmptyState,
  IconButton,
  MetricCard,
  ToggleGroup,
  Textarea,
  Tooltip,
  isPrimaryActionKey,
  type DateRangeValue,
  Text,
} from "@repo-prism/ui";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  FileDiff,
  ListTodo,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
  XCircle,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { JobConsole } from "./JobConsole.js";
import { JobTokenIo } from "./JobTokenIo.js";
import {
  GATE_PATH_SAMPLE,
  gateOverflowNote,
  isLiveJob,
  jobElapsed,
  heartbeatAge,
  jobAgentLabel,
  hostClientLabel,
  jobUsageFigures,
  jobEnvelopeLabel,
  JOB_ENVELOPE_TIP,
  jobBadgeTone,
  jobBadgePulse,
  jobDisplayLabel,
  jobValidationLabel,
  jobValidationTone,
  jobValidationTooltip,
  jobMessage,
  compactJobError,
  jobModelLabel,
  jobsWaitingOnYou,
  jobStages,
  jobNextAction,
  jobReviewPending,
  jobReviewAccepted,
  jobReviewLooksForeign,
  jobStatusTone,
  jobTimeBreakdown,
  mergeConsoleEntries,
  newestEntryTs,
  orderJobsForBoard,
  reviewFileTotals,
  splitJobSummary,
  isDispatchNotePath,
  jobNotePaths,
  parseFabricationMention,
  type JobConsoleEntry,
  type JobStage,
  type JobControlAction,
  type JobControlExtra,
  type JobReview,
  type JobSummary,
  type JobsPort,
  jobBoardKey,
  matchesBoardLane,
  type JobBoardLane,
  type JobWorkspaceChip,
} from "./jobs-types.js";
import {
  DEFAULT_JOB_RANGE,
  JOB_RANGE_PRESETS,
  jobInRange,
  jobMatchesRepo,
  jobRangeWindow,
  jobStampMs,
} from "./jobs-range.js";

export type JobsScreenProps = {
  readonly repoLabel: string;
  readonly port: JobsPort;
  /**
   * The jobs to render. Owned by the host, which is already reading them for
   * its own chrome — so the screen and its header cannot disagree.
   */
  readonly jobs: readonly JobSummary[];
  /**
   * True until the host's first read lands. "We have not looked yet" and "we
   * looked and there is nothing" are different states, and rendering the empty
   * copy for the first is how the board flashed "No jobs yet" on every load.
   */
  readonly loading: boolean;
  /** A failure the host hit reading the list. */
  readonly listError?: string;
  /** Re-read now. Wired to the Refresh button. */
  readonly onRefresh?: () => void;
  /** Poll interval for the open console. Defaults to 2s. */
  readonly pollMs?: number;
  /** Injectable for tests. */
  readonly now?: () => number;
  /**
   * When the host last read this list, and whether that read is still trusted.
   * A dropped SSE stream must be visible: presenting a frozen list as current
   * is the same class of lie as a clock that keeps counting after a job ends
   * (ADR-0048).
   */
  readonly asOf?: string;
  readonly stale?: boolean;
  /**
   * Repositories the host could not read. These used to be dropped silently,
   * which is indistinguishable from a repository with no jobs.
   */
  readonly workspaceErrors?: readonly {
    readonly label: string;
    readonly detail: string;
  }[];
  /** Override the screen title. */
  readonly heading?: string;
  readonly eyebrow?: string;
  /** When set, hide the waiting banner — the whole view *is* that list. */
  readonly approvalsOnly?: boolean;
  readonly emptyTitle?: string;
  readonly emptyBody?: string;
  /**
   * Repositories the Console is watching. Repo scoping uses the global
   * top-bar selection (`repoFilter`), not an in-page dropdown.
   */
  readonly workspaces?: readonly JobWorkspaceChip[];
  /** Global workspace path from the top-bar repo picker. */
  readonly repoFilter?: string;
  /** Open the job's write-up on the Findings page. */
  readonly onOpenFindings?: (job: JobSummary, notePath?: string) => void;
  /** Hide the board chrome when this screen is the Focus inspector. */
  readonly chrome?: "full" | "inspector" | "focus";
  /** Open this job on first paint (Focus). */
  readonly defaultOpenId?: string;
};

const DEFAULT_POLL_MS = 2_000;

/** Wall-clock time of an ISO stamp, or the raw string if it will not parse. */
function formatClock(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Date and time for the accordion header, so two jobs on different days are distinguishable. */
function formatStamp(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function jobStamp(job: JobSummary): string | undefined {
  return formatStamp(
    job.finishedAt ?? job.startedAt ?? job.createdAt ?? job.updatedAt,
  );
}

type ConsoleState = {
  readonly entries: readonly JobConsoleEntry[];
  readonly loading: boolean;
  /** True after the first successful (or failed) read, even when empty. */
  readonly fetched?: boolean;
  readonly error?: string;
  /** From the host's page, so truncation can be disclosed rather than hidden. */
  readonly totalCount?: number;
  readonly truncated?: boolean;
};

const CONSOLE_CACHE_PREFIX = "prism.dispatch.console.v1:";

function readConsoleCache(
  jobId: string,
): readonly JobConsoleEntry[] | undefined {
  try {
    const raw = sessionStorage.getItem(`${CONSOLE_CACHE_PREFIX}${jobId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { entries?: JobConsoleEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : undefined;
  } catch {
    return undefined;
  }
}

function writeConsoleCache(
  jobId: string,
  entries: readonly JobConsoleEntry[],
): void {
  if (entries.length === 0) return;
  try {
    sessionStorage.setItem(
      `${CONSOLE_CACHE_PREFIX}${jobId}`,
      JSON.stringify({ entries: entries.slice(-2_000) }),
    );
  } catch {
    // Quota or private mode — the JSONL file is still the source of truth.
  }
}

function ReviewSummary(props: {
  review: JobReview;
  canDecide?: boolean;
  canRestore?: boolean;
  busy?: boolean;
  onDecide?: (action: "keep" | "restore", path?: string) => void;
}): ReactElement {
  const { review } = props;
  const mixed = new Set(review.mixedPaths ?? []);
  const kept = new Set(review.keptPaths ?? []);
  const pending = review.files.filter((file) => !kept.has(file.path));
  const accepted = jobReviewAccepted(review);
  const showActions = Boolean(props.canDecide && props.onDecide);
  return (
    <div
      className={accepted ? "job-review job-review--accepted" : "job-review"}
    >
      <div className="job-review__head">
        <FileDiff size={14} aria-hidden />
        <strong>Files modified</strong>
        <span className="job-review__totals">{reviewFileTotals(review)}</span>
        {showActions && pending.length > 0 ? (
          <div className="job-review__bulk">
            <Button
              size="sm"
              variant="secondary"
              className="job-review__keep-all"
              disabled={props.busy}
              icon={<Check size={12} aria-hidden />}
              onClick={() => props.onDecide?.("keep")}
            >
              Keep all
            </Button>
            {props.canRestore ? (
              <Button
                size="sm"
                variant="danger"
                className="job-review__restore-all"
                disabled={props.busy}
                icon={<RotateCcw size={12} aria-hidden />}
                onClick={() => props.onDecide?.("restore")}
              >
                Restore all
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {review.branch ? (
        <p className="job-review__branch">
          on <code>{review.branch}</code>
        </p>
      ) : null}
      <ul className="job-review__files">
        {review.files.map((file) => {
          const blocked = mixed.has(file.path);
          const isKept = kept.has(file.path);
          return (
            <li
              key={file.path}
              className={[
                "job-review__file",
                isKept ? "job-review__file--kept" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="job-review__file-main">
                <code className="job-review__path">{file.path}</code>
                <span
                  className={`job-review__change job-review__change--${file.change}`}
                >
                  {file.change}
                </span>
                <span className="job-review__churn">
                  <span className="job-review__added">+{file.added}</span>
                  <span className="job-review__removed">-{file.removed}</span>
                </span>
              </div>
              {isKept ? (
                <span className="job-review__kept">Kept</span>
              ) : showActions ? (
                <div className="job-review__actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="job-review__keep"
                    disabled={props.busy}
                    title="Keep this file as the job left it"
                    icon={<Check size={12} aria-hidden />}
                    onClick={() => props.onDecide?.("keep", file.path)}
                  >
                    Keep
                  </Button>
                  {props.canRestore ? (
                    <Button
                      size="sm"
                      variant="danger"
                      className="job-review__restore"
                      disabled={props.busy || blocked}
                      title={
                        blocked
                          ? "This file was already dirty in your tree — restoring it would throw away your work"
                          : "Restore this file to HEAD"
                      }
                      icon={<RotateCcw size={12} aria-hidden />}
                      onClick={() => props.onDecide?.("restore", file.path)}
                    >
                      Restore
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {review.truncated ? (
        <p className="job-review__note">
          Showing the first {review.files.length} files.
        </p>
      ) : null}
      {mixed.size > 0 ? (
        <p className="job-review__note">
          {mixed.size} file{mixed.size === 1 ? " was" : "s were"} already dirty
          in your tree — those stay yours. Restore only undoes the job's files.
        </p>
      ) : null}
      <p className="job-review__note job-review__note--strong">
        {accepted
          ? "These changes were accepted."
          : review.committed
            ? "This work is on its own branch. Nothing has been merged into the branch you are on — review the diff, then merge or drop it yourself."
            : "These edits are uncommitted in your working tree. Keep a file to accept it, restore it to undo the job, or commit just these files."}
      </p>
    </div>
  );
}

/**
 * GitHub Actions-style job graph: append-only nodes, never a rewound bar.
 *
 * Motion (GSAP) lives in the Console bundle (ADR-0051). This tree is
 * CSS-only so the IDE Jobs board stays off GSAP. The current step has no
 * outgoing connector and blinks until the job proceeds.
 */
function JobTimeline(props: {
  stages: readonly JobStage[];
  outcome?: "error" | "cancelled";
  nextAction?: ReturnType<typeof jobNextAction>;
  onKeepAll?: () => void;
}): ReactElement {
  const complete = props.stages.at(-1)?.reached ?? false;
  const railClass = [
    "job-rail",
    complete ? "job-rail--complete" : "",
    props.outcome === "error" ? "job-rail--failed" : "",
    props.outcome === "cancelled" ? "job-rail--cancelled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // A gated job sits on Accepted, not Waiting — hiding the CTA there made
  // "Start anyway" look like dead copy in the Focus drawer.
  const showCta = props.nextAction?.action === "keep";
  return (
    <div className={railClass}>
      <ol className="job-rail__steps">
        {props.stages.map((stage, index) => {
          const failedFinish =
            (stage.kind === "finished" ||
              stage.kind === "failed" ||
              stage.kind === "cancelled") &&
            (props.outcome === "error" || props.outcome === "cancelled");
          return (
            <li
              key={stage.id}
              className={[
                "job-rail__step",
                `job-rail__step--${stage.kind}`,
                stage.note === "paused" ? "job-rail__step--pause" : "",
                stage.reached ? "job-rail__step--reached" : "",
                stage.current ? "job-rail__step--current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={stage.current ? "step" : undefined}
              {...(stage.elapsedMs !== undefined
                ? { "data-elapsed-ms": String(stage.elapsedMs) }
                : {})}
            >
              {index < props.stages.length - 1 &&
              stage.reached &&
              !stage.current ? (
                <span className="job-rail__seg" aria-hidden />
              ) : null}
              <span className="job-rail__node" aria-hidden>
                {stage.reached && !stage.current ? (
                  failedFinish ? (
                    <X size={11} strokeWidth={3} />
                  ) : (
                    <Check size={11} strokeWidth={3} />
                  )
                ) : stage.current && stage.kind === "waiting" ? (
                  <AlertTriangle size={11} strokeWidth={3} />
                ) : null}
              </span>
              <span className="job-rail__label">{stage.label}</span>
              {stage.at ? (
                <time className="job-rail__at" dateTime={stage.at}>
                  {formatClock(stage.at)}
                </time>
              ) : (
                <span className="job-rail__at job-rail__at--pending">—</span>
              )}
              {stage.span ? (
                <span className="job-rail__span">
                  {stage.current ? `${stage.span} so far` : stage.span}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {showCta && props.nextAction ? (
        <div className="job-rail__cta">
          <p className="job-rail__cta-copy">{props.nextAction.copy}</p>
          <div className="job-rail__cta-actions">
            <Button
              size="sm"
              variant="primary"
              onClick={() => props.onKeepAll?.()}
            >
              Keep all
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type InlineOpts = {
  readonly onNoteClick?: (path: string) => void;
};

function renderInline(text: string, opts?: InlineOpts): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const value = part.slice(1, -1);
      if (opts?.onNoteClick && isDispatchNotePath(value)) {
        return (
          <Button
            key={index}
            type="button"
            variant="tertiary"
            className="job-outcome__note"
            onClick={() => opts.onNoteClick?.(value.replace(/^\.\//, ""))}
          >
            {value}
          </Button>
        );
      }
      return <code key={index}>{value}</code>;
    }
    return part;
  });
}

function SummaryRichText(props: {
  text: string;
  onNoteClick?: (path: string) => void;
}): ReactElement {
  const blocks = props.text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const inline: InlineOpts | undefined = props.onNoteClick
    ? { onNoteClick: props.onNoteClick }
    : undefined;
  return (
    <div className="job-outcome__prose">
      {blocks.map((block, index) => {
        const lines = block
          .split("\n")
          .filter((line) => line.trim().length > 0);
        if (lines.length === 0) return null;
        const heading = lines[0] ?? "";
        if (lines.length === 1 && /^#{1,3}\s+\S/.test(heading)) {
          const depth = heading.match(/^#+/)?.[0].length ?? 1;
          const label = heading.replace(/^#+\s+/, "");
          const Tag = depth === 1 ? "h3" : depth === 2 ? "h4" : "h5";
          return (
            <Tag key={index} className="job-outcome__heading">
              {renderInline(label, inline)}
            </Tag>
          );
        }
        const listed = lines.every((line) => /^[-*]\s+/.test(line));
        if (listed) {
          return (
            <ul key={index} className="job-outcome__list">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {renderInline(line.replace(/^[-*]\s+/, ""), inline)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line, inline)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function MentionLine(props: {
  line: string;
  citedMissing?: readonly string[];
  onNoteClick?: (path: string) => void;
}): ReactElement {
  const parsed = parseFabricationMention(props.line);
  const [open, setOpen] = useState(false);
  if (!parsed) return <>{renderInline(props.line, props)}</>;
  const full = props.citedMissing?.length ? props.citedMissing : parsed.shown;
  const extra =
    parsed.extra > 0 || (props.citedMissing?.length ?? 0) > parsed.shown.length;
  return (
    <>
      It mentioned{" "}
      {parsed.shown.map((path, index) => (
        <span key={path}>
          {index > 0 ? ", " : null}
          {renderInline(`\`${path}\``, props)}
        </span>
      ))}
      {extra ? (
        <>
          {" "}
          <Button
            type="button"
            variant="tertiary"
            className="job-outcome__more"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open
              ? "hide"
              : `+${parsed.extra || full.length - parsed.shown.length} more`}
          </Button>
        </>
      ) : null}
      , which was not written.
      {open ? (
        <ul className="job-outcome__extras">
          {full.map((path) => (
            <li key={path}>{renderInline(`\`${path}\``, props)}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function JobWriteUp(props: {
  body?: string;
  notePath?: string;
  onOpen?: (path: string) => void;
  onNoteClick?: (path: string) => void;
}): ReactElement | null {
  if (!props.body && !props.notePath) return null;
  return (
    <div className="job-outcome__findings">
      <div className="job-outcome__findings-bar">
        <p className="job-outcome__findings-kicker">Write-up</p>
        {props.onOpen && props.notePath ? (
          <Button
            type="button"
            variant="tertiary"
            className="job-outcome__open"
            onClick={() => props.onOpen?.(props.notePath!)}
          >
            Open full findings
          </Button>
        ) : null}
      </div>
      {props.body ? (
        <SummaryRichText
          text={props.body}
          {...(props.onNoteClick ? { onNoteClick: props.onNoteClick } : {})}
        />
      ) : null}
    </div>
  );
}

function JobOutcome(props: {
  job: JobSummary;
  onOpenFindings?: (job: JobSummary, notePath?: string) => void;
}): ReactElement | null {
  const { job } = props;
  const summary = job.resultSummary?.trim();
  const parts = summary
    ? splitJobSummary(summary, Boolean(job.verification))
    : undefined;
  const notes = jobNotePaths(job);
  const onNoteClick = props.onOpenFindings
    ? (path: string) => props.onOpenFindings?.(job, path)
    : undefined;
  if (!summary && !job.workerBackend && !job.errorMessage) return null;
  return (
    <div className="job-outcome">
      <div className="job-outcome__head">
        <p className="job-outcome__kicker">Job summary</p>
        <div className="job-outcome__chips">
          <span className="job-outcome__chip">
            {jobAgentLabel(job.workerBackend)}
          </span>
          <span className="job-outcome__chip job-outcome__chip--model">
            {jobModelLabel(
              job.workerBackend,
              job.workerModel,
              job.workerThinking,
            )}
          </span>
        </div>
      </div>
      {parts && parts.meta.length > 0 ? (
        <ul className="job-outcome__meta">
          {parts.meta.map((line) => (
            <li key={line}>
              {/^It mentioned /i.test(line) ? (
                <MentionLine
                  line={line}
                  {...(job.citedMissing
                    ? { citedMissing: job.citedMissing }
                    : {})}
                  {...(onNoteClick ? { onNoteClick } : {})}
                />
              ) : (
                renderInline(line, onNoteClick ? { onNoteClick } : undefined)
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <JobWriteUp
        {...(parts?.body ? { body: parts.body } : {})}
        {...(notes[0] ? { notePath: notes[0] } : {})}
        {...(onNoteClick ? { onOpen: onNoteClick, onNoteClick } : {})}
      />
      {parts && parts.checks.length > 0 ? (
        <ul className="job-outcome__meta job-outcome__meta--checks">
          {parts.checks.map((line) => (
            <li key={line}>{renderInline(line)}</li>
          ))}
        </ul>
      ) : null}
      {job.errorMessage ? (
        <p className="job-outcome__error">
          {compactJobError(job.errorMessage)}
        </p>
      ) : null}
    </div>
  );
}

/** Prepare-drawer row: stacked label + wrapping value, not a cramped KPI tile. */
function JobFactCard(props: {
  readonly label: string;
  readonly value: ReactNode;
  readonly tooltip?: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <article className="job-fact">
      <div className="job-fact__title">
        <h3>
          {props.label}
          {props.tooltip ? (
            <Tooltip label={props.label} wide align="end">
              {props.tooltip}
            </Tooltip>
          ) : null}
        </h3>
        <div className="job-fact__body">
          <div className="job-fact__value">{props.value}</div>
          {props.action}
        </div>
      </div>
    </article>
  );
}

/**
 * The absolute times behind the card's one relative number.
 *
 * The row says "3m"; this says which 3 minutes, and how much of it was spent
 * waiting rather than working — the number that tells you whether the pipeline
 * or the agent was slow (ADR-0047).
 */
function JobFacts(props: {
  job: JobSummary;
  now: number;
  onKeepAll?: () => void;
}): ReactElement | null {
  const { job } = props;
  const stages = jobStages(job, props.now);
  const known = stages.filter((stage) => stage.reached);
  const breakdown = jobTimeBreakdown(job, props.now);
  const nextAction = jobNextAction(job);
  if (known.length === 0 && !breakdown) return null;
  return (
    <div className="job-facts">
      {breakdown ? <p className="job-facts__split">{breakdown}</p> : null}
      {known.length > 0 ? (
        <JobTimeline
          stages={stages}
          {...(job.status === "error" || job.status === "cancelled"
            ? { outcome: job.status }
            : {})}
          {...(nextAction ? { nextAction } : {})}
          {...(props.onKeepAll ? { onKeepAll: props.onKeepAll } : {})}
        />
      ) : null}
      {job.workspaceLabel ? (
        <p className="job-facts__repo">in {job.workspaceLabel}</p>
      ) : null}
      {/* The one place a path belongs: someone reading a job detail is trying
          to go look at the branch. `checkout` is called out because it means
          the teammate edited the tree the user is sitting in. */}
      {job.worktreePath ? (
        <p className="job-facts__where">
          {job.placement === "checkout"
            ? "Edited your working tree at "
            : "Checked out at "}
          <code>{job.worktreePath}</code>
        </p>
      ) : null}
    </div>
  );
}

function JobBrief(props: {
  readonly job: JobSummary;
  readonly onStartChild?: (prd: string) => Promise<void>;
}): ReactElement | null {
  const [value, setValue] = useState(props.job.prd ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setValue(props.job.prd ?? "");
  }, [props.job.id, props.job.prd]);

  if (!props.onStartChild && !(props.job.prd ?? "").trim()) {
    return null;
  }

  const dirty = value !== (props.job.prd ?? "");
  const canStart =
    Boolean(props.onStartChild) && dirty && Boolean(value.trim());

  const startChild = async (): Promise<void> => {
    if (!props.onStartChild || !canStart) return;
    setBusy(true);
    setError(undefined);
    try {
      await props.onStartChild(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="job-outcome job-outcome--brief">
      <div className="job-outcome__head">
        <p className="job-outcome__kicker">Teammate instructions</p>
      </div>
      {props.onStartChild ? (
        <div className="job-brief">
          <div className="job-brief__scroll">
            <Textarea
              id={`job-brief-${props.job.id}`}
              className="job-brief__field"
              label="Teammate instructions"
              aria-label="Teammate instructions"
              placeholder="Write prompt here"
              rows={6}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (isPrimaryActionKey(event)) {
                  event.preventDefault();
                  void startChild();
                }
              }}
            />
          </div>
          {error ? (
            <p className="job-brief__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="job-brief__actions">
            <p className="job-brief__hint">
              Update the instruction and start a child job. Esc to close · ⌘↵ to
              start
            </p>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !canStart}
              aria-keyshortcuts="Meta+Enter Control+Enter"
              onClick={() => void startChild()}
            >
              Start child job
            </Button>
          </div>
        </div>
      ) : (
        <div className="job-brief__scroll">
          <SummaryRichText text={value} />
        </div>
      )}
    </div>
  );
}

export function JobsScreen(props: JobsScreenProps): ReactElement {
  const pollMs = props.pollMs ?? DEFAULT_POLL_MS;
  const nowFn = props.now ?? Date.now;

  const [lane, setLane] = useState<JobBoardLane>("all");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const window = jobRangeWindow(DEFAULT_JOB_RANGE, nowFn());
    return {
      preset: DEFAULT_JOB_RANGE,
      startMs: window.startMs,
      endMs: window.endMs,
    };
  });
  const repoFilter = props.repoFilter ?? "all";
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [controlError, setControlError] = useState<string | undefined>();
  const [tick, setTick] = useState(() => nowFn());
  const rangeValue = useMemo((): DateRangeValue => {
    if (range.preset === "custom") return range;
    const window = jobRangeWindow(range.preset, tick);
    return {
      preset: range.preset,
      startMs: window.startMs,
      endMs: window.endMs,
    };
  }, [range, tick]);
  const rangeMinMs = useMemo(() => {
    let min: number | undefined;
    for (const job of props.jobs) {
      const at = jobStampMs(job);
      if (at === undefined) continue;
      if (min === undefined || at < min) min = at;
    }
    return min;
  }, [props.jobs]);

  const jobs = useMemo(() => {
    const ranked = props.approvalsOnly
      ? jobsWaitingOnYou(props.jobs)
      : orderJobsForBoard(props.jobs);
    return ranked.filter((job) => {
      if (hiddenKeys.has(jobBoardKey(job))) return false;
      if (!jobInRange(job, rangeValue.startMs, rangeValue.endMs)) return false;
      if (!jobMatchesRepo(job, repoFilter)) return false;
      return matchesBoardLane(job, lane);
    });
  }, [
    props.approvalsOnly,
    props.jobs,
    hiddenKeys,
    lane,
    repoFilter,
    rangeValue.startMs,
    rangeValue.endMs,
  ]);

  const scopedJobs = useMemo(() => {
    return props.jobs.filter((job) => {
      if (hiddenKeys.has(jobBoardKey(job))) return false;
      if (!jobInRange(job, rangeValue.startMs, rangeValue.endMs)) return false;
      return jobMatchesRepo(job, repoFilter);
    });
  }, [
    props.jobs,
    hiddenKeys,
    repoFilter,
    rangeValue.startMs,
    rangeValue.endMs,
  ]);
  const listError = props.listError;
  const loaded = !props.loading;
  const [openId, setOpenId] = useState<string | null>(
    () => props.defaultOpenId ?? null,
  );
  useEffect(() => {
    if (props.defaultOpenId) setOpenId(props.defaultOpenId);
  }, [props.defaultOpenId]);
  const [consoles, setConsoles] = useState<Record<string, ConsoleState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const portRef = useRef(props.port);
  portRef.current = props.port;
  const consolesRef = useRef(consoles);
  consolesRef.current = consoles;

  const loadConsole = useCallback(async (jobId: string) => {
    const cached = readConsoleCache(jobId);
    const since = newestEntryTs(
      consolesRef.current[jobId]?.entries ?? cached ?? [],
    );
    setConsoles((current) => {
      const prev = current[jobId];
      const seeded = prev?.entries.length
        ? prev.entries
        : (cached ?? prev?.entries ?? []);
      if (prev?.fetched && seeded.length > 0) {
        return seeded === prev.entries
          ? current
          : {
              ...current,
              [jobId]: { ...prev, entries: seeded, loading: false },
            };
      }
      if (prev?.fetched) return current;
      return {
        ...current,
        [jobId]: {
          entries: seeded,
          loading: seeded.length === 0,
          ...(seeded.length > 0 ? { fetched: true } : {}),
        },
      };
    });
    try {
      const page = await portRef.current.jobLogs(jobId, since);
      setConsoles((current) => {
        const prev = current[jobId];
        const held = prev?.entries ?? cached ?? [];
        const incoming = page.entries;
        const entries =
          incoming.length === 0 && held.length > 0
            ? (held as JobConsoleEntry[])
            : mergeConsoleEntries(held, incoming);
        writeConsoleCache(jobId, entries);
        const truncated = page.truncated || entries.length < page.totalCount;
        if (
          prev?.fetched &&
          prev.loading === false &&
          prev.error === undefined &&
          prev.entries === entries &&
          prev.totalCount === page.totalCount &&
          prev.truncated === truncated
        ) {
          return current;
        }
        return {
          ...current,
          [jobId]: {
            entries,
            loading: false,
            fetched: true,
            totalCount: Math.max(page.totalCount, entries.length),
            truncated,
          },
        };
      });
    } catch (cause) {
      setConsoles((current) => ({
        ...current,
        [jobId]: {
          entries: current[jobId]?.entries ?? cached ?? [],
          loading: false,
          fetched: true,
          error: cause instanceof Error ? cause.message : String(cause),
        },
      }));
    }
    // `consoles` is read through the setter, so this stays stable per job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (openId) void loadConsole(openId);
  }, [openId, loadConsole]);

  const hasLive = useMemo(
    () => jobs.some((job) => isLiveJob(job.status)),
    [jobs],
  );
  const openLive = useMemo(() => {
    if (!openId) return false;
    const open = props.jobs.find((job) => job.id === openId);
    return open ? isLiveJob(open.status) : false;
  }, [openId, props.jobs]);

  // Drives the elapsed clock and the open console. The list itself is the
  // host's job now. Stops when nothing is live, so a finished board — and a
  // finished job's open console — is not polling forever.
  useEffect(() => {
    if (!hasLive && !openLive) return;
    const timer = setInterval(() => {
      if (hasLive) setTick(nowFn());
      if (openLive && openId) void loadConsole(openId);
    }, pollMs);
    return () => clearInterval(timer);
  }, [hasLive, openLive, openId, pollMs, loadConsole, nowFn]);

  const toggle = useCallback(
    (jobId: string) => {
      setOpenId((current) => {
        const next = current === jobId ? null : jobId;
        if (next) void loadConsole(next);
        return next;
      });
    },
    [loadConsole],
  );

  const control = useCallback(
    async (
      action: JobControlAction,
      job: JobSummary,
      extra?: JobControlExtra,
    ) => {
      if (!portRef.current.control) return;
      const key = jobBoardKey(job);
      setBusyId(job.id);
      setControlError(undefined);
      if (action === "delete") {
        setHiddenKeys((current) => new Set([...current, key]));
        setOpenId((current) => (current === job.id ? null : current));
      }
      try {
        await (extra
          ? portRef.current.control(action, job.id, extra)
          : portRef.current.control(action, job.id));
        if (action === "delete") {
          setConsoles((current) => {
            const { [job.id]: _dropped, ...rest } = current;
            return rest;
          });
        }
        props.onRefresh?.();
      } catch (cause) {
        if (action === "delete") {
          setHiddenKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }
        setControlError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusyId(null);
      }
    },
    [props],
  );

  const liveCount = scopedJobs.filter((job) => isLiveJob(job.status)).length;
  const reviewCount = scopedJobs.filter(jobReviewPending).length;
  const finishedCount = scopedJobs.filter((job) =>
    matchesBoardLane(job, "finished"),
  ).length;
  const failedCount = scopedJobs.filter((job) =>
    matchesBoardLane(job, "failed"),
  ).length;
  const waiting = useMemo(() => jobsWaitingOnYou(scopedJobs), [scopedJobs]);
  const waitingCount = waiting.length;
  const heading = props.heading ?? "Jobs";
  const compact = props.chrome === "inspector" || props.chrome === "focus";

  return (
    <section
      className={
        props.chrome === "inspector" || props.chrome === "focus"
          ? `jobs-screen jobs-screen--inspector${props.chrome === "focus" ? " jobs-screen--focus" : ""}`
          : "jobs-screen"
      }
      aria-labelledby="jobs-title"
    >
      <header className="jobs-screen__head">
        <div>
          <Text
            variant="title"
            as="h1"
            id="jobs-title"
            className="jobs-screen__title"
          >
            {heading}
          </Text>
          {compact ? (
            <p className="jobs-screen__repo">{props.repoLabel}</p>
          ) : (
            <Text variant="lede" as="p" className="jobs-screen__lede">
              Archive of Dispatch jobs for this workspace — live teammates,
              waiting approvals, and finished work.
            </Text>
          )}
        </div>
        {compact ? null : (
          <Button
            size="sm"
            variant="tertiary"
            className="jobs-screen__refresh"
            icon={<RefreshCw size={14} aria-hidden />}
            onClick={() => props.onRefresh?.()}
          >
            Refresh
          </Button>
        )}
      </header>

      {compact ? null : (
        <section className="jobs-screen__kpis" aria-label="Job summary">
          <MetricCard
            label="Total"
            value={scopedJobs.length}
            icon={ListTodo}
            tone="brand"
            tooltip="Jobs in the selected time range for this workspace."
          />
          <MetricCard
            label="Live"
            value={liveCount}
            icon={Activity}
            tone="brand"
            tooltip="Running or starting teammates."
            {...(liveCount > 0 ? { sub: `${liveCount} live` } : {})}
          />
          <MetricCard
            label="Waiting"
            value={waitingCount}
            icon={Clock}
            tone="amber"
            tooltip="Jobs parked until you approve them."
            {...(waitingCount > 0
              ? { sub: `${waitingCount} awaiting approval` }
              : {})}
          />
          <MetricCard
            label="Finished"
            value={finishedCount}
            icon={CheckCircle2}
            tone="emerald"
            tooltip="Done, cancelled, or waiting on your review."
            {...(reviewCount > 0 ? { sub: `${reviewCount} to review` } : {})}
          />
          <MetricCard
            label="Failed"
            value={failedCount}
            icon={XCircle}
            tone="rose"
            tooltip="Jobs that ended in error."
          />
        </section>
      )}

      {listError ? (
        <p className="jobs-screen__error" role="alert">
          <AlertTriangle size={14} aria-hidden /> {listError}
        </p>
      ) : null}

      {controlError ? (
        <p className="jobs-screen__error" role="alert">
          <AlertTriangle size={14} aria-hidden /> {controlError}
        </p>
      ) : null}

      {/* A repository that failed to read is named, not dropped. Silently
          omitting it makes a broken checkout look like an idle one. */}
      {props.workspaceErrors?.map((row) => (
        <p key={row.label} className="jobs-screen__error" role="alert">
          <AlertTriangle size={14} aria-hidden /> Could not read {row.label}:{" "}
          {row.detail}
        </p>
      ))}

      {/* The list is still the last one we successfully read, so it stays on
          screen — but it is labelled, rather than passed off as current. */}
      {props.stale ? (
        <p className="jobs-screen__stale" role="status">
          Live updates dropped. Showing the last known list
          {props.asOf ? ` from ${formatClock(props.asOf)}` : ""}.
        </p>
      ) : null}

      {!props.approvalsOnly ? (
        <div
          className="jobs-screen__filters"
          role="toolbar"
          aria-label="Filter jobs"
        >
          <ToggleGroup
            aria-label="Status"
            className="jobs-screen__status"
            value={lane}
            onChange={(id) => setLane(id as JobBoardLane)}
            options={[
              { id: "all", label: "All" },
              { id: "live", label: "Live" },
              { id: "waiting", label: "Waiting" },
              { id: "finished", label: "Finished" },
              { id: "failed", label: "Failed" },
            ]}
          />
          <DateRangePicker
            aria-label="Time range"
            className="jobs-screen__range"
            presets={JOB_RANGE_PRESETS}
            value={rangeValue}
            nowMs={tick}
            {...(rangeMinMs !== undefined ? { minMs: rangeMinMs } : {})}
            presetWindow={jobRangeWindow}
            onChange={setRange}
          />
        </div>
      ) : null}

      {/* Approvals used to live only in chat after "where are we". Pin them
          above the board so a parked job cannot hide under finished work. */}
      {!props.approvalsOnly && waitingCount > 0 ? (
        <aside className="jobs-screen__waiting" role="status">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <strong>
              {waitingCount === 1
                ? "1 job is awaiting approval"
                : `${waitingCount} jobs are awaiting approval`}
            </strong>
            <p className="jobs-screen__waiting-list">
              {waiting.map((job) => job.title).join(" · ")}
            </p>
            <p className="jobs-screen__waiting-hint">
              Confirm or cancel on the{" "}
              {waitingCount === 1 ? "card below" : "cards below"}.
            </p>
          </div>
        </aside>
      ) : null}

      {/* Without this the empty copy renders for one frame on every load and
          then vanishes, which reads as a flicker rather than a state. */}
      {!loaded && !listError ? (
        <ul className="jobs-screen__list" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <li key={row} className="job-card job-card--skeleton" aria-hidden>
              <span className="job-card__skeleton-line" />
              <span className="job-card__skeleton-line job-card__skeleton-line--short" />
            </li>
          ))}
        </ul>
      ) : null}

      {loaded && jobs.length === 0 && !listError ? (
        <EmptyState>
          <Terminal size={16} aria-hidden />{" "}
          {scopedJobs.length > 0 ? (
            <strong>No jobs in this view</strong>
          ) : (
            <>
              <strong>{props.emptyTitle ?? "No jobs yet"}</strong>
              {props.emptyBody ? (
                <> — {props.emptyBody}</>
              ) : (
                <>
                  {" "}
                  — ask Prism to change something (“fix the pagination cap”) and
                  a teammate starts here.
                </>
              )}
            </>
          )}
        </EmptyState>
      ) : null}

      <ul className="jobs-screen__list">
        {jobs.map((job) => {
          const open = props.chrome === "focus" || openId === job.id;
          const live = isLiveJob(job.status);
          const stalled =
            job.status === "waiting_on_you" || job.status === "blocked";
          const gated = job.status === "needs_confirm";
          const consoleState = consoles[job.id];
          const reviewing = jobReviewPending(job);
          const checksRunning = job.lastActivity === "Running checks…";
          const cardBusy = busyId === job.id || checksRunning;
          const activityRaw = reviewing
            ? (job.resultSummary ?? "Finished — review the changes.")
            : (jobMessage(job) ?? "");
          const badge = jobDisplayLabel(job);
          const activity =
            activityRaw &&
            activityRaw.trim().toLowerCase() !== badge.toLowerCase()
              ? activityRaw
              : "";
          const usage = jobUsageFigures(job.tokenUsage);
          const timeTip = jobTimeBreakdown(job, tick);
          return (
            <li
              key={jobBoardKey(job)}
              className={`job-card job-card--${jobStatusTone(job.status)}${open ? " job-card--open" : ""}`}
            >
              {props.chrome === "focus" ? null : (
                <div className="job-card__row">
                  <Button
                    type="button"
                    variant="tertiary"
                    className="job-card__disclose"
                    aria-expanded={open}
                    onClick={() => toggle(job.id)}
                  >
                    {open ? (
                      <ChevronDown size={16} aria-hidden />
                    ) : (
                      <ChevronRight size={16} aria-hidden />
                    )}
                    <span className="job-card__title">{job.title}</span>
                  </Button>
                  <span className="job-card__scan">
                    <span
                      className="job-card__time"
                      title={jobTimeBreakdown(job, tick) ?? undefined}
                    >
                      {jobElapsed(job, tick) || "—"}
                    </span>
                    {job.branch ? (
                      <span className="job-card__branch-wrap">
                        <code className="job-card__branch">{job.branch}</code>
                        <IconButton
                          variant="tertiary"
                          className="job-card__icon-btn"
                          label="Copy branch"
                          onClick={() =>
                            void navigator.clipboard.writeText(job.branch ?? "")
                          }
                        >
                          <Copy size={13} aria-hidden />
                        </IconButton>
                      </span>
                    ) : (
                      <span className="job-card__unknown">not placed yet</span>
                    )}
                    {job.workspaceLabel ? (
                      <span className="job-card__repo">
                        {job.workspaceLabel}
                      </span>
                    ) : null}
                  </span>
                  <Badge
                    tone={jobBadgeTone(job.status, job.nextStep)}
                    className="job-card__status"
                    pulse={jobBadgePulse(job.status)}
                  >
                    {jobBadgePulse(job.status) ? (
                      <span className="job-card__pulse" aria-hidden />
                    ) : null}
                    {jobDisplayLabel(job)}
                    {live && heartbeatAge(job, tick) ? (
                      <span className="job-card__heartbeat">
                        {heartbeatAge(job, tick)}
                      </span>
                    ) : null}
                  </Badge>
                  {jobStamp(job) ? (
                    <time
                      className="job-card__when"
                      dateTime={
                        job.finishedAt ??
                        job.startedAt ??
                        job.createdAt ??
                        job.updatedAt
                      }
                    >
                      {jobStamp(job)}
                    </time>
                  ) : null}
                  {props.port.control &&
                  !gated &&
                  !live &&
                  job.status !== "paused" ? (
                    <IconButton
                      variant="danger"
                      className="job-card__icon-btn job-card__icon-btn--danger"
                      disabled={cardBusy}
                      onClick={() => void control("delete", job)}
                      label="Delete"
                    >
                      <Trash2 size={14} aria-hidden />
                    </IconButton>
                  ) : null}
                </div>
              )}

              {!open && activity ? (
                <p className="job-card__activity">{activity}</p>
              ) : null}

              {stalled ? (
                <p className="job-card__warn">
                  <AlertTriangle size={13} aria-hidden />
                  No recent output.
                </p>
              ) : null}

              {job.status === "queued" && job.nextStep ? (
                <p className="job-card__note">{job.nextStep}</p>
              ) : null}

              {/* A gate the drain parked (ADR-0047). Before M-067 this
                  returned a chat sentence and created no job at all, so the
                  work simply vanished. */}
              {props.chrome !== "focus" && gated ? (
                <div className="job-card__gate">
                  <p className="job-card__warn">
                    <AlertTriangle size={13} aria-hidden />
                    {job.confirm?.question ??
                      "This job is awaiting approval before it can start."}
                  </p>
                  {/* A sample, not the whole tree. A repo mid-refactor can be
                      hundreds of files dirty, and rendering all of them buries
                      the two buttons this card exists for under a scroll. */}
                  {job.confirm?.dirtyPaths?.length ? (
                    <>
                      <ul className="job-card__gate-paths">
                        {job.confirm.dirtyPaths
                          .slice(0, GATE_PATH_SAMPLE)
                          .map((path) => (
                            <li key={path}>
                              <code>{path}</code>
                            </li>
                          ))}
                      </ul>
                      {job.confirm.dirtyPaths.length > GATE_PATH_SAMPLE ? (
                        <p className="job-card__note">
                          {gateOverflowNote(job.confirm.dirtyPaths.length)}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  {props.port.control ? (
                    <div className="job-card__controls">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={cardBusy}
                        icon={<Trash2 size={13} aria-hidden />}
                        onClick={() => void control("delete", job)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {open ? (
                <div className="job-card__panel">
                  {activity ? (
                    <p className="job-card__activity job-card__activity--panel">
                      {activity}
                    </p>
                  ) : null}
                  <div className="job-card__facts">
                    <JobFactCard label="Status" value={jobDisplayLabel(job)} />
                    <JobFactCard
                      label="Triggered"
                      value={jobStamp(job) || "—"}
                    />
                    <JobFactCard
                      label="Platform"
                      value={hostClientLabel(job.hostClient)}
                    />
                    <JobFactCard
                      label="Time"
                      value={jobElapsed(job, tick) || "—"}
                      {...(timeTip ? { tooltip: timeTip } : {})}
                    />
                    <JobFactCard
                      label="Branch"
                      value={job.branch ?? "not placed yet"}
                      {...(job.branch
                        ? {
                            action: (
                              <IconButton
                                variant="tertiary"
                                className="job-fact__copy"
                                label="Copy branch"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void navigator.clipboard.writeText(
                                    job.branch ?? "",
                                  );
                                }}
                              >
                                <Copy size={13} aria-hidden />
                              </IconButton>
                            ),
                          }
                        : {})}
                    />
                    {job.review &&
                    job.review.files.length > 0 &&
                    !jobReviewLooksForeign(job) ? (
                      <JobFactCard
                        label="Changes"
                        value={reviewFileTotals(job.review)}
                      />
                    ) : null}
                    <JobFactCard
                      label="Agent"
                      value={jobAgentLabel(job.workerBackend)}
                    />
                    <JobFactCard
                      label="Model"
                      value={jobModelLabel(
                        job.workerBackend,
                        job.workerModel,
                        job.workerThinking,
                      )}
                    />
                    <JobFactCard
                      label="Context"
                      value={usage.context}
                      tooltip="Occupancy of the last prompt this run — the model window."
                    />
                    <JobFactCard
                      label="Tokens"
                      value={<JobTokenIo usage={job.tokenUsage} />}
                      tooltip="Input and output billed for this run. Envelope counts Prism lists, not this bill."
                    />
                    <JobFactCard
                      label="Envelope"
                      value={jobEnvelopeLabel(job.envelopeUsage)}
                      tooltip={JOB_ENVELOPE_TIP}
                    />
                    <JobFactCard
                      label="Validation Status"
                      value={
                        <Badge tone={jobValidationTone(job)}>
                          {jobValidationLabel(job)}
                        </Badge>
                      }
                      tooltip={jobValidationTooltip(job)}
                    />
                  </div>
                  <JobFacts
                    job={job}
                    now={tick}
                    {...(props.port.control
                      ? {
                          onKeepAll: () => void control("accept_all", job),
                        }
                      : {})}
                  />
                  <JobBrief
                    job={job}
                    {...(props.port.startChild
                      ? {
                          onStartChild: (prd) =>
                            props.port.startChild!(job.id, prd),
                        }
                      : {})}
                  />
                  {!live ? (
                    <JobOutcome
                      job={job}
                      {...(props.onOpenFindings
                        ? { onOpenFindings: props.onOpenFindings }
                        : {})}
                    />
                  ) : null}
                  {job.review &&
                  job.review.files.length > 0 &&
                  !jobReviewLooksForeign(job) ? (
                    <ReviewSummary
                      review={job.review}
                      canDecide={Boolean(props.port.control) && reviewing}
                      canRestore={
                        Boolean(props.port.control) &&
                        reviewing &&
                        job.placement !== "worktree"
                      }
                      busy={busyId === job.id}
                      onDecide={(decision, path) =>
                        void control(
                          decision === "keep"
                            ? path
                              ? "accept_file"
                              : "accept_all"
                            : path
                              ? "reject_file"
                              : "reject_all",
                          job,
                          path ? { path } : undefined,
                        )
                      }
                    />
                  ) : null}
                  <JobConsole
                    entries={consoleState?.entries ?? []}
                    live={live}
                    loading={consoleState?.loading ?? false}
                    error={consoleState?.error}
                    {...(consoleState?.totalCount === undefined
                      ? {}
                      : { totalCount: consoleState.totalCount })}
                    {...(consoleState?.truncated === undefined
                      ? {}
                      : { truncated: consoleState.truncated })}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
