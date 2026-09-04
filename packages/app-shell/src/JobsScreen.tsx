import { EmptyState } from "@repo-prism/ui";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
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
import {
  GATE_PATH_SAMPLE,
  gateOverflowNote,
  isLiveJob,
  jobElapsed,
  heartbeatAge,
  jobAgentLabel,
  jobDisplayLabel,
  jobModelLabel,
  jobsWaitingOnYou,
  jobRailFill,
  jobStages,
  jobReviewPending,
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
  workspaceChipsForBoard,
  type JobBoardLane,
  type JobWorkspaceChip,
} from "./jobs-types.js";

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
   * Repositories the Console is watching. The board always offers a filter
   * so a mixed list can be scoped to one checkout.
   */
  readonly workspaces?: readonly JobWorkspaceChip[];
  /** Workspace path to pre-select from `#/jobs?repo=`. */
  readonly repoFilter?: string;
  readonly onRepoFilterChange?: (path: string) => void;
  /** Open the job's write-up on the Findings page. */
  readonly onOpenFindings?: (job: JobSummary, notePath?: string) => void;
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
  const showActions = Boolean(props.canDecide && props.onDecide);
  return (
    <div className="job-review">
      <div className="job-review__head">
        <FileDiff size={14} aria-hidden />
        <strong>Ready for review</strong>
        <span className="job-review__totals">{reviewFileTotals(review)}</span>
        {showActions && pending.length > 0 ? (
          <div className="job-review__bulk">
            <button
              type="button"
              className="job-review__keep-all"
              disabled={props.busy}
              onClick={() => props.onDecide?.("keep")}
            >
              <Check size={12} aria-hidden />
              Keep all
            </button>
            {props.canRestore ? (
              <button
                type="button"
                className="job-review__restore-all"
                disabled={props.busy}
                onClick={() => props.onDecide?.("restore")}
              >
                <RotateCcw size={12} aria-hidden />
                Restore all
              </button>
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
                  <button
                    type="button"
                    className="job-review__keep"
                    disabled={props.busy}
                    title="Keep this file as the job left it"
                    onClick={() => props.onDecide?.("keep", file.path)}
                  >
                    <Check size={12} aria-hidden />
                    Keep
                  </button>
                  {props.canRestore ? (
                    <button
                      type="button"
                      className="job-review__restore"
                      disabled={props.busy || blocked}
                      title={
                        blocked
                          ? "This file was already dirty in your tree — restoring it would throw away your work"
                          : "Restore this file to HEAD"
                      }
                      onClick={() => props.onDecide?.("restore", file.path)}
                    >
                      <RotateCcw size={12} aria-hidden />
                      Restore
                    </button>
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
        {review.committed
          ? "This work is on its own branch. Nothing has been merged into the branch you are on — review the diff, then merge or drop it yourself."
          : "These edits are uncommitted in your working tree. Keep a file to accept it, restore it to undo the job, or commit just these files."}
      </p>
    </div>
  );
}

/**
 * The lifecycle rail: where the job is, and how long each stage took.
 *
 * An ordered list rather than a row of divs, because that is what it is — a
 * screen reader gets "1 of 4, Accepted" instead of four unlabelled boxes. The
 * only animation is on the rung the job is currently sitting on, and
 * `jobs-extra.css` drops it under `prefers-reduced-motion`.
 */
function JobTimeline(props: { stages: readonly JobStage[] }): ReactElement {
  const fill = jobRailFill(props.stages);
  const complete = fill >= 1;
  return (
    <div
      className={`job-rail${complete ? " job-rail--complete" : ""}`}
      style={{ ["--job-rail-fill" as string]: String(fill) }}
    >
      <div className="job-rail__bar" aria-hidden>
        <span className="job-rail__track" />
        <span className="job-rail__fill" />
      </div>
      <ol className="job-rail__steps">
        {props.stages.map((stage) => (
          <li
            key={stage.id}
            className={[
              "job-rail__step",
              stage.reached ? "job-rail__step--reached" : "",
              stage.current ? "job-rail__step--current" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={stage.current ? "step" : undefined}
          >
            <span className="job-rail__node" aria-hidden>
              {stage.reached && !stage.current ? (
                <Check size={11} strokeWidth={3} />
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
        ))}
      </ol>
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
          <button
            key={index}
            type="button"
            className="job-outcome__note"
            onClick={() => opts.onNoteClick?.(value.replace(/^\.\//, ""))}
          >
            {value}
          </button>
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
          <button
            type="button"
            className="job-outcome__more"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open
              ? "hide"
              : `+${parsed.extra || full.length - parsed.shown.length} more`}
          </button>
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
          <button
            type="button"
            className="job-outcome__open"
            onClick={() => props.onOpen?.(props.notePath!)}
          >
            Open full findings
          </button>
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
        <p className="job-outcome__error">{job.errorMessage}</p>
      ) : null}
    </div>
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
}): ReactElement | null {
  const { job } = props;
  const stages = jobStages(job, props.now);
  const known = stages.filter((stage) => stage.reached);
  const breakdown = jobTimeBreakdown(job, props.now);
  if (known.length === 0 && !breakdown) return null;
  return (
    <div className="job-facts">
      {breakdown ? <p className="job-facts__split">{breakdown}</p> : null}
      {known.length > 0 ? <JobTimeline stages={stages} /> : null}
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

export function JobsScreen(props: JobsScreenProps): ReactElement {
  const pollMs = props.pollMs ?? DEFAULT_POLL_MS;
  const nowFn = props.now ?? Date.now;

  const [lane, setLane] = useState<JobBoardLane>("all");
  const [repoFilter, setRepoFilter] = useState<string>(
    () => props.repoFilter ?? "all",
  );
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [controlError, setControlError] = useState<string | undefined>();

  const workspaces = useMemo(
    () => workspaceChipsForBoard(props.jobs, props.workspaces),
    [props.jobs, props.workspaces],
  );

  useEffect(() => {
    if (props.repoFilter) setRepoFilter(props.repoFilter);
  }, [props.repoFilter]);

  const selectRepo = useCallback(
    (path: string) => {
      setRepoFilter(path);
      props.onRepoFilterChange?.(path);
    },
    [props.onRepoFilterChange],
  );

  const jobs = useMemo(() => {
    const ranked = props.approvalsOnly
      ? jobsWaitingOnYou(props.jobs)
      : orderJobsForBoard(props.jobs);
    return ranked.filter((job) => {
      if (hiddenKeys.has(jobBoardKey(job))) return false;
      if (repoFilter !== "all" && job.workspacePath !== repoFilter) {
        return false;
      }
      return matchesBoardLane(job, lane);
    });
  }, [props.approvalsOnly, props.jobs, hiddenKeys, lane, repoFilter]);

  const scopedJobs = useMemo(() => {
    return props.jobs.filter((job) => {
      if (hiddenKeys.has(jobBoardKey(job))) return false;
      if (repoFilter !== "all" && job.workspacePath !== repoFilter) {
        return false;
      }
      return true;
    });
  }, [props.jobs, hiddenKeys, repoFilter]);
  const listError = props.listError;
  const loaded = !props.loading;
  const [openId, setOpenId] = useState<string | null>(null);
  const [consoles, setConsoles] = useState<Record<string, ConsoleState>>({});
  const [tick, setTick] = useState(() => nowFn());
  const [busyId, setBusyId] = useState<string | null>(null);

  const portRef = useRef(props.port);
  portRef.current = props.port;
  const consolesRef = useRef(consoles);
  consolesRef.current = consoles;

  const loadConsole = useCallback(async (jobId: string) => {
    const since = newestEntryTs(consolesRef.current[jobId]?.entries ?? []);
    setConsoles((current) => {
      const prev = current[jobId];
      if (prev?.fetched) return current;
      return {
        ...current,
        [jobId]: {
          entries: prev?.entries ?? [],
          loading: (prev?.entries.length ?? 0) === 0,
        },
      };
    });
    try {
      const page = await portRef.current.jobLogs(jobId, since);
      setConsoles((current) => {
        const prev = current[jobId];
        const entries = mergeConsoleEntries(prev?.entries ?? [], page.entries);
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
            totalCount: page.totalCount,
            truncated,
          },
        };
      });
    } catch (cause) {
      setConsoles((current) => ({
        ...current,
        [jobId]: {
          entries: current[jobId]?.entries ?? [],
          loading: false,
          fetched: true,
          error: cause instanceof Error ? cause.message : String(cause),
        },
      }));
    }
    // `consoles` is read through the setter, so this stays stable per job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const waiting = useMemo(() => jobsWaitingOnYou(scopedJobs), [scopedJobs]);
  const waitingCount = waiting.length;
  const heading = props.heading ?? "Jobs";
  const eyebrow = props.eyebrow ?? "Prism Dispatch";

  return (
    <section className="jobs-screen" aria-labelledby="jobs-title">
      <header className="jobs-screen__head">
        <div>
          <p className="jobs-screen__eyebrow">{eyebrow}</p>
          <h1 id="jobs-title" className="jobs-screen__title">
            {heading}
          </h1>
          <p className="jobs-screen__repo">{props.repoLabel}</p>
        </div>
        <div className="jobs-screen__meta">
          {waitingCount > 0 ? (
            <span className="jobs-screen__count jobs-screen__count--waiting">
              {waitingCount} need your OK
            </span>
          ) : null}
          {liveCount > 0 ? (
            <span className="jobs-screen__count jobs-screen__count--live">
              {liveCount} live
            </span>
          ) : null}
          {reviewCount > 0 ? (
            <span className="jobs-screen__count jobs-screen__count--review">
              {reviewCount} to review
            </span>
          ) : null}
          <button
            type="button"
            className="jobs-screen__refresh"
            onClick={() => props.onRefresh?.()}
          >
            <RefreshCw size={14} aria-hidden />
            Refresh
          </button>
        </div>
      </header>

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
          <div className="jobs-screen__lanes">
            {(
              [
                ["all", "All", scopedJobs.length],
                [
                  "live",
                  "Live",
                  scopedJobs.filter((job) => isLiveJob(job.status)).length,
                ],
                ["waiting", "Waiting", waitingCount],
                [
                  "finished",
                  "Finished",
                  scopedJobs.filter((job) => matchesBoardLane(job, "finished"))
                    .length,
                ],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className="jobs-screen__chip"
                aria-pressed={lane === id}
                onClick={() => setLane(id)}
              >
                {label}
                <span className="jobs-screen__chip-count">{count}</span>
              </button>
            ))}
          </div>
          {workspaces.length > 0 ? (
            <div
              className="jobs-screen__repos"
              role="group"
              aria-label="Repository"
            >
              <button
                type="button"
                className="jobs-screen__chip"
                aria-pressed={repoFilter === "all"}
                onClick={() => selectRepo("all")}
              >
                All repos
              </button>
              {workspaces.map((repo) => (
                <button
                  key={repo.path}
                  type="button"
                  className="jobs-screen__chip"
                  aria-pressed={repoFilter === repo.path}
                  title={
                    repo.error ? `Could not read: ${repo.error}` : repo.path
                  }
                  aria-label={`${repo.label} repository`}
                  onClick={() => selectRepo(repo.path)}
                >
                  {repo.label}
                  {typeof repo.jobCount === "number" ? (
                    <span className="jobs-screen__chip-count">
                      {repo.jobCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
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
                ? "1 job needs your OK"
                : `${waitingCount} jobs need your OK`}
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
          const open = openId === job.id;
          const live = isLiveJob(job.status);
          const stalled = job.status === "waiting_on_you";
          const gated = job.status === "needs_confirm";
          const consoleState = consoles[job.id];
          const reviewing = jobReviewPending(job);
          const activityRaw = reviewing
            ? (job.resultSummary ?? "Finished — review the changes.")
            : (job.errorMessage ?? job.lastActivity ?? job.resultSummary ?? "");
          const badge = jobDisplayLabel(job);
          const activity =
            activityRaw &&
            activityRaw.trim().toLowerCase() !== badge.toLowerCase()
              ? activityRaw
              : "";
          return (
            <li
              key={jobBoardKey(job)}
              className={`job-card job-card--${jobStatusTone(job.status)}${open ? " job-card--open" : ""}`}
            >
              <div className="job-card__row">
                <button
                  type="button"
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
                </button>
                <span className="job-card__scan">
                  <span
                    className="job-card__time"
                    title={jobTimeBreakdown(job, tick) ?? undefined}
                  >
                    {jobElapsed(job, tick) || "—"}
                  </span>
                  {job.branch ? (
                    <code className="job-card__branch">{job.branch}</code>
                  ) : (
                    <span className="job-card__unknown">not placed yet</span>
                  )}
                  {job.workspaceLabel ? (
                    <span className="job-card__repo">{job.workspaceLabel}</span>
                  ) : null}
                </span>
                <span
                  className={`job-card__status job-card__status--${jobStatusTone(job.status, job.nextStep)}`}
                >
                  {live &&
                  !/low on (memory|disk)|job cap/i.test(job.nextStep ?? "") ? (
                    <span className="job-card__pulse" aria-hidden />
                  ) : null}
                  {jobDisplayLabel(job)}
                  {live && heartbeatAge(job, tick) ? (
                    <span className="job-card__heartbeat">
                      {heartbeatAge(job, tick)}
                    </span>
                  ) : null}
                </span>
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
                  <button
                    type="button"
                    className="job-card__icon-btn"
                    disabled={busyId === job.id}
                    onClick={() => void control("delete", job)}
                    title="Remove this job from the board"
                    aria-label="Delete"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                ) : null}
              </div>

              {!open && activity ? (
                <p className="job-card__activity">{activity}</p>
              ) : null}

              {stalled ? (
                <p className="job-card__warn">
                  <AlertTriangle size={13} aria-hidden />
                  No recent output. Resume to nudge it, or cancel.
                </p>
              ) : null}

              {job.status === "queued" && job.nextStep ? (
                <p className="job-card__note">{job.nextStep}</p>
              ) : null}

              {/* A gate the drain parked (ADR-0047). Before M-067 this
                  returned a chat sentence and created no job at all, so the
                  work simply vanished. */}
              {gated ? (
                <div className="job-card__gate">
                  <p className="job-card__warn">
                    <AlertTriangle size={13} aria-hidden />
                    {job.confirm?.question ??
                      "This job needs your OK before it can start."}
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
                      <button
                        type="button"
                        className="job-card__button job-card__button--primary"
                        disabled={busyId === job.id}
                        onClick={() => void control("confirm", job)}
                      >
                        Yes, start it
                      </button>
                      <button
                        type="button"
                        className="job-card__button job-card__button--danger"
                        disabled={busyId === job.id}
                        onClick={() => void control("cancel", job)}
                      >
                        <X size={13} aria-hidden />
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="job-card__button job-card__button--danger"
                        disabled={busyId === job.id}
                        onClick={() => void control("delete", job)}
                        title="Remove this job from the board"
                      >
                        <Trash2 size={13} aria-hidden />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {props.port.control &&
              !gated &&
              (live || job.status === "paused") ? (
                <div className="job-card__controls">
                  {job.status === "paused" || stalled ? (
                    <button
                      type="button"
                      className="job-card__button"
                      disabled={busyId === job.id}
                      onClick={() => void control("resume", job)}
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="job-card__button"
                      disabled={busyId === job.id}
                      onClick={() => void control("pause", job)}
                    >
                      Pause
                    </button>
                  )}
                  <button
                    type="button"
                    className="job-card__button job-card__button--danger"
                    disabled={busyId === job.id}
                    onClick={() => void control("cancel", job)}
                  >
                    <X size={13} aria-hidden />
                    Cancel
                  </button>
                </div>
              ) : null}

              {open ? (
                <div className="job-card__panel">
                  {activity ? (
                    <p className="job-card__activity job-card__activity--panel">
                      {activity}
                    </p>
                  ) : null}
                  <dl className="job-card__facts">
                    <div>
                      <dt>Time</dt>
                      <dd title={jobTimeBreakdown(job, tick) ?? undefined}>
                        {jobElapsed(job, tick) || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Branch</dt>
                      <dd>
                        {job.branch ? (
                          <code>{job.branch}</code>
                        ) : (
                          <span className="job-card__unknown">
                            not placed yet
                          </span>
                        )}
                      </dd>
                    </div>
                    {job.review && job.review.files.length > 0 ? (
                      <div>
                        <dt>Changes</dt>
                        <dd>{reviewFileTotals(job.review)}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Agent</dt>
                      <dd>{jobAgentLabel(job.workerBackend)}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>
                        {jobModelLabel(
                          job.workerBackend,
                          job.workerModel,
                          job.workerThinking,
                        )}
                      </dd>
                    </div>
                  </dl>
                  <JobFacts job={job} now={tick} />
                  {!live ? (
                    <JobOutcome
                      job={job}
                      {...(props.onOpenFindings
                        ? { onOpenFindings: props.onOpenFindings }
                        : {})}
                    />
                  ) : null}
                  {job.verification ? (
                    <p className={`job-verify job-verify--${job.verification}`}>
                      <strong>Checks {job.verification}</strong>
                      {job.verificationDetail
                        ? ` — ${job.verificationDetail}`
                        : ""}
                    </p>
                  ) : null}
                  {job.review && job.review.files.length > 0 ? (
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
