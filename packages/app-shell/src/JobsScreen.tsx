import { EmptyState } from "@repo-prism/ui";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileDiff,
  RefreshCw,
  Terminal,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { JobConsole } from "./JobConsole.js";
import {
  formatElapsed,
  isLiveJob,
  jobStatusLabel,
  jobStatusTone,
  mergeConsoleEntries,
  newestEntryTs,
  reviewFileTotals,
  type JobConsoleEntry,
  type JobControlAction,
  type JobReview,
  type JobSummary,
  type JobsPort,
} from "./jobs-types.js";

export type JobsScreenProps = {
  readonly repoLabel: string;
  readonly port: JobsPort;
  /** Poll interval for the live job list and console. Defaults to 2s. */
  readonly pollMs?: number;
  /** Injectable for tests. */
  readonly now?: () => number;
};

const DEFAULT_POLL_MS = 2_000;

type ConsoleState = {
  readonly entries: readonly JobConsoleEntry[];
  readonly loading: boolean;
  readonly error?: string;
};

function ReviewSummary(props: { review: JobReview }): ReactElement {
  const { review } = props;
  return (
    <div className="job-review">
      <div className="job-review__head">
        <FileDiff size={14} aria-hidden />
        <strong>Ready for review</strong>
        <span className="job-review__totals">{reviewFileTotals(review)}</span>
      </div>
      {review.branch ? (
        <p className="job-review__branch">
          on <code>{review.branch}</code>
        </p>
      ) : null}
      <ul className="job-review__files">
        {review.files.map((file) => (
          <li key={file.path} className="job-review__file">
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
          </li>
        ))}
      </ul>
      {review.truncated ? (
        <p className="job-review__note">
          Showing the first {review.files.length} files.
        </p>
      ) : null}
      <p className="job-review__note job-review__note--strong">
        This work is on its own branch. Nothing has been merged into the branch
        you are on — review the diff, then merge or drop it yourself.
      </p>
    </div>
  );
}

export function JobsScreen(props: JobsScreenProps): ReactElement {
  const pollMs = props.pollMs ?? DEFAULT_POLL_MS;
  const nowFn = props.now ?? Date.now;

  const [jobs, setJobs] = useState<readonly JobSummary[]>([]);
  const [listError, setListError] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [consoles, setConsoles] = useState<Record<string, ConsoleState>>({});
  const [tick, setTick] = useState(() => nowFn());
  const [busyId, setBusyId] = useState<string | null>(null);

  const portRef = useRef(props.port);
  portRef.current = props.port;

  const refreshJobs = useCallback(async () => {
    try {
      const next = await portRef.current.listJobs();
      setJobs(next);
      setListError(undefined);
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoaded(true);
    }
  }, []);

  const loadConsole = useCallback(async (jobId: string) => {
    const since = newestEntryTs(consoles[jobId]?.entries ?? []);
    setConsoles((current) => ({
      ...current,
      [jobId]: {
        entries: current[jobId]?.entries ?? [],
        loading: (current[jobId]?.entries.length ?? 0) === 0,
      },
    }));
    try {
      const page = await portRef.current.jobLogs(jobId, since);
      setConsoles((current) => ({
        ...current,
        [jobId]: {
          entries: mergeConsoleEntries(
            current[jobId]?.entries ?? [],
            page.entries,
          ),
          loading: false,
        },
      }));
    } catch (cause) {
      setConsoles((current) => ({
        ...current,
        [jobId]: {
          entries: current[jobId]?.entries ?? [],
          loading: false,
          error: cause instanceof Error ? cause.message : String(cause),
        },
      }));
    }
    // `consoles` is read through the setter, so this stays stable per job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  const hasLive = useMemo(
    () => jobs.some((job) => isLiveJob(job.status)),
    [jobs],
  );

  // One timer drives the list, the open console, and the elapsed clock. It
  // stops when nothing is live so a finished board is not polling forever.
  useEffect(() => {
    if (!hasLive && openId === null) return;
    const timer = setInterval(() => {
      setTick(nowFn());
      void refreshJobs();
      if (openId) void loadConsole(openId);
    }, pollMs);
    return () => clearInterval(timer);
  }, [hasLive, openId, pollMs, refreshJobs, loadConsole, nowFn]);

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
    async (action: JobControlAction, jobId: string) => {
      if (!portRef.current.control) return;
      setBusyId(jobId);
      try {
        await portRef.current.control(action, jobId);
        await refreshJobs();
      } finally {
        setBusyId(null);
      }
    },
    [refreshJobs],
  );

  const liveCount = jobs.filter((job) => isLiveJob(job.status)).length;
  const reviewCount = jobs.filter(
    (job) => job.status === "needs_review",
  ).length;

  return (
    <section className="jobs-screen" aria-labelledby="jobs-title">
      <header className="jobs-screen__head">
        <div>
          <p className="jobs-screen__eyebrow">Prism Dispatch</p>
          <h1 id="jobs-title" className="jobs-screen__title">
            Jobs
          </h1>
          <p className="jobs-screen__repo">{props.repoLabel}</p>
        </div>
        <div className="jobs-screen__meta">
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
            onClick={() => void refreshJobs()}
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

      {loaded && jobs.length === 0 && !listError ? (
        <EmptyState>
          <Terminal size={16} aria-hidden /> <strong>No jobs yet</strong> — ask
          Prism to change something (“fix the pagination cap”) and a teammate
          starts here in its own worktree.
        </EmptyState>
      ) : null}

      <ul className="jobs-screen__list">
        {jobs.map((job) => {
          const open = openId === job.id;
          const live = isLiveJob(job.status);
          const stalled = job.status === "waiting_on_you";
          const consoleState = consoles[job.id];
          return (
            <li
              key={job.id}
              className={`job-card job-card--${jobStatusTone(job.status)}`}
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
                <span
                  className={`job-card__status job-card__status--${jobStatusTone(job.status)}`}
                >
                  {live ? (
                    <span className="job-card__pulse" aria-hidden />
                  ) : null}
                  {jobStatusLabel(job.status)}
                </span>
              </div>

              <p className="job-card__activity">
                {job.status === "needs_review"
                  ? (job.resultSummary ?? "Finished — review the changes.")
                  : (job.errorMessage ??
                    job.lastActivity ??
                    job.resultSummary ??
                    "")}
              </p>

              <dl className="job-card__facts">
                <div>
                  <dt>Time</dt>
                  <dd>{formatElapsed(job.startedAt, tick) || "—"}</dd>
                </div>
                <div>
                  <dt>Branch</dt>
                  <dd>
                    <code>{job.branch}</code>
                  </dd>
                </div>
                {job.review ? (
                  <div>
                    <dt>Changes</dt>
                    <dd>{reviewFileTotals(job.review)}</dd>
                  </div>
                ) : null}
              </dl>

              {stalled ? (
                <p className="job-card__warn">
                  <AlertTriangle size={13} aria-hidden />
                  No recent output. Resume to nudge it, or cancel.
                </p>
              ) : null}

              {props.port.control && (live || job.status === "paused") ? (
                <div className="job-card__controls">
                  {job.status === "paused" || stalled ? (
                    <button
                      type="button"
                      className="job-card__button"
                      disabled={busyId === job.id}
                      onClick={() => void control("resume", job.id)}
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="job-card__button"
                      disabled={busyId === job.id}
                      onClick={() => void control("pause", job.id)}
                    >
                      Pause
                    </button>
                  )}
                  <button
                    type="button"
                    className="job-card__button job-card__button--danger"
                    disabled={busyId === job.id}
                    onClick={() => void control("cancel", job.id)}
                  >
                    <X size={13} aria-hidden />
                    Cancel
                  </button>
                </div>
              ) : null}

              {open ? (
                <div className="job-card__panel">
                  {job.review ? <ReviewSummary review={job.review} /> : null}
                  <JobConsole
                    entries={consoleState?.entries ?? []}
                    live={live}
                    loading={consoleState?.loading ?? false}
                    error={consoleState?.error}
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
