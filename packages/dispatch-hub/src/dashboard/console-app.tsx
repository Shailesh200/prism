import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  JobsScreen,
  isLiveJob,
  jobBadgeTone,
  jobDisplayLabel,
  type JobControlAction,
  type JobControlExtra,
  type JobSummary,
} from "@repo-prism/app-shell";
import { Badge, Button } from "@repo-prism/ui";
import { attentionJobs } from "./attention.js";
import { ConsoleFooter } from "./console-footer.js";
import { FindingsView } from "./findings-view.js";
import { IntelligenceView } from "./intelligence-view.js";
import { CONSOLE_VIEWS, useHashRoute, VIEW_LABELS } from "./router.js";
import { getJson, readToken } from "./session.js";
import { ConsoleToastHost, showConsoleToast } from "./console-toast.js";
import { SettingsView } from "./settings-view.js";
import { useJobsFeed } from "./use-jobs.js";
import { useJobRailMotion } from "./job-rail-motion.js";

type RepoRow = {
  readonly path: string;
  readonly label: string;
  readonly lastSeenAt: string;
  readonly jobCount: number;
  readonly error?: string;
};

type ReposResponse = { readonly repos: RepoRow[]; readonly asOf: string };

type JobControlFn = (
  action: JobControlAction,
  jobId: string,
  extra?: JobControlExtra,
) => Promise<void>;

export function ConsoleApp(): ReactElement {
  const token = useMemo(() => readToken(), []);
  const {
    view,
    go,
    repo: repoFilter,
    job: jobId,
    note: notePath,
  } = useHashRoute();
  const feed = useJobsFeed(token);
  const waitingCount = attentionJobs(feed.summaries).length;
  const workspaces = useWorkspaces(token, feed);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [version, setVersion] = useState<string | undefined>();
  const [focusId, setFocusId] = useState<string | undefined>();
  const railSignature = feed.summaries
    .map(
      (job) =>
        `${job.id}:${job.status}:${job.startedAt ?? ""}:${job.finishedAt ?? ""}`,
    )
    .join("|");
  useJobRailMotion(shellRef, railSignature);

  useEffect(() => {
    let alive = true;
    void getJson<{ version: string }>("/api/healthz", token)
      .then((body) => {
        if (alive) setVersion(body.version);
      })
      .catch(() => {
        /* Footer still renders without a version. */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const focusJob = focusId
    ? feed.summaries.find((job) => job.id === focusId)
    : undefined;

  /** Same hub control path the Jobs inspector uses. */
  const runJobControl: JobControlFn = async (action, jobId, extra) => {
    if (!feed.port.control) {
      showConsoleToast("Job controls are not available.");
      return;
    }
    try {
      await (extra
        ? feed.port.control(action, jobId, extra)
        : feed.port.control(action, jobId));
      if (action === "resume") {
        showConsoleToast("Resumed");
      }
    } catch (cause) {
      showConsoleToast(
        cause instanceof Error ? cause.message : String(cause),
      );
      throw cause;
    }
  };

  return (
    <div className="console" ref={shellRef}>
      <header className="console__bar">
        <div className="console__brand" aria-label="Prism Dispatch">
          <img
            className="console__mark-img"
            src="/assets/prism-mark.png"
            width={22}
            height={22}
            alt=""
          />
          <span className="console__wordmark">
            <span className="console__wordmark-prism">Prism</span>
            <span className="console__wordmark-dispatch">Dispatch</span>
          </span>
        </div>
        <nav className="console__nav" aria-label="Console views">
          {CONSOLE_VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              className={`console__tab${view === id ? " console__tab--on" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              {VIEW_LABELS[id]}
              {id === "attention" && waitingCount > 0 ? (
                <span
                  className="console__tab-badge"
                  aria-label={`${waitingCount} need your OK`}
                >
                  {waitingCount}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <main
        className={
          view === "findings" && jobId
            ? "console__main console__main--findings"
            : "console__main"
        }
      >
        {/* A failed read is reported inside the board, not instead of it: the
            last known jobs stay visible and labelled, which is more useful
            than replacing them with an error page. */}
        {view === "jobs" ? (
          <JobsScreen
            repoLabel={repoLabel(feed)}
            port={feed.port}
            jobs={feed.summaries}
            loading={feed.loading}
            onRefresh={feed.refresh}
            asOf={feed.asOf}
            stale={feed.stale}
            workspaceErrors={feed.errors.map((row) => ({
              label: row.label,
              detail: row.detail,
            }))}
            workspaces={workspaces}
            {...(repoFilter ? { repoFilter } : {})}
            onRepoFilterChange={(path) =>
              go("jobs", path === "all" ? undefined : { repo: path })
            }
            {...(feed.fatal ? { listError: feed.fatal } : {})}
            onOpenFindings={(job, note) =>
              go("findings", {
                job: job.id,
                ...(note ? { note } : {}),
                ...(job.workspacePath ? { repo: job.workspacePath } : {}),
              })
            }
          />
        ) : null}

        {view === "attention" ? (
          <AttentionView
            jobs={feed.summaries}
            control={runJobControl}
            canControl={Boolean(feed.port.control)}
            loading={feed.loading}
            onOpen={(job) => setFocusId(job.id)}
          />
        ) : null}

        {view === "findings" ? (
          <FindingsView
            token={token}
            jobs={feed.summaries}
            {...(jobId ? { jobId } : {})}
            {...(notePath ? { notePath } : {})}
          />
        ) : null}

        {view === "intelligence" ? (
          <IntelligenceView
            token={token}
            jobs={feed.summaries}
            workspaces={workspaces}
          />
        ) : null}
        {view === "settings" ? <SettingsView token={token} /> : null}
      </main>
      <ConsoleFooter {...(version ? { version } : {})} />
      <ConsoleToastHost />

      {focusJob ? (
        <div className="focus-layer" role="dialog" aria-label="Focus">
          <button
            type="button"
            className="focus-layer__scrim"
            aria-label="Close"
            onClick={() => setFocusId(undefined)}
          />
          <div className="focus-layer__panel">
            <header className="focus-layer__head">
              <h2 className="focus-layer__title">{focusJob.title}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFocusId(undefined)}
              >
                Close
              </Button>
            </header>
            <JobsScreen
              repoLabel={focusJob.workspaceLabel ?? "Job"}
              port={{
                ...feed.port,
                control: runJobControl,
              }}
              jobs={[focusJob]}
              loading={false}
              onRefresh={feed.refresh}
              heading={focusJob.title}
              eyebrow="Focus"
              onOpenFindings={(job, note) => {
                setFocusId(undefined);
                go("findings", {
                  job: job.id,
                  ...(note ? { note } : {}),
                  ...(job.workspacePath ? { repo: job.workspacePath } : {}),
                });
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The subtitle under "Jobs".
 *
 * Counting to zero before the first read has landed would read as "no jobs"
 * when the truth is "we have not looked yet", so loading gets its own words.
 *
 * A read that has *failed* is not still loading, and this is the one place
 * that distinction escapes. `loading` is "no successful read yet", which stays
 * true forever when every request is rejected — an expired token left the
 * subtitle promising to read repositories it was never going to be allowed to
 * see. Found during the M-067 ship gate.
 */
export function repoLabel(feed: {
  readonly loading: boolean;
  readonly jobs: readonly unknown[];
  readonly errors: readonly unknown[];
  readonly fatal?: string | undefined;
}): string {
  if (feed.loading) {
    return feed.fatal
      ? "Could not read your repositories"
      : "Reading your repositories…";
  }
  const jobs = `${feed.jobs.length} job${feed.jobs.length === 1 ? "" : "s"}`;
  if (feed.errors.length > 0) {
    const repos = `${feed.errors.length} repo${feed.errors.length === 1 ? "" : "s"}`;
    return `${jobs} · ${repos} unreadable`;
  }
  return `${jobs} across your repositories`;
}

function AttentionView(props: {
  readonly jobs: readonly JobSummary[];
  readonly control: JobControlFn;
  readonly canControl: boolean;
  readonly loading: boolean;
  readonly onOpen: (job: JobSummary) => void;
}): ReactElement {
  const rows = attentionJobs(props.jobs);
  const [busyId, setBusyId] = useState<string | undefined>();

  const run = async (
    action: JobControlAction,
    job: JobSummary,
  ): Promise<void> => {
    setBusyId(job.id);
    try {
      await props.control(action, job.id);
    } catch {
      /* Toast already shown by runJobControl. */
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <section className="console__panel">
      <h1 className="console__title">Attention</h1>
      {rows.length === 0 ? (
        <p className="console__lede">
          Nothing is waiting on you. Dirty-tree gates, stalled teammates, and
          paused jobs show up here.
        </p>
      ) : (
        <p className="console__lede">{rows.length} need you</p>
      )}
      {props.loading ? <div className="attention-scan" aria-hidden /> : null}
      <ul className="attention-list">
        {rows.map((job) => {
          const stalled = job.status === "waiting_on_you";
          const paused = job.status === "paused";
          const gated = job.status === "needs_confirm";
          const live = isLiveJob(job.status) && !stalled;
          const busy = busyId === job.id;
          return (
            <li
              key={`${job.workspacePath}:${job.id}`}
              className="attention-card"
            >
              <div className="attention-card__head">
                <strong>{job.title}</strong>
                <Badge tone={jobBadgeTone(job.status, job.nextStep)}>
                  {jobDisplayLabel(job)}
                </Badge>
              </div>
              {job.workspaceLabel ? <span>{job.workspaceLabel}</span> : null}
              <p>
                {job.confirm?.question ??
                  (stalled
                    ? "No recent output. Resume to nudge it, or cancel."
                    : paused
                      ? "Paused — resume when you want it to continue."
                      : "The teammate asked a question.")}
              </p>
              <div className="attention-card__actions">
                {gated ? (
                  <Button
                    variant="primary"
                    disabled={busy || !props.canControl}
                    onClick={() => void run("confirm", job)}
                  >
                    Start anyway
                  </Button>
                ) : null}
                {paused || stalled ? (
                  <Button
                    variant="primary"
                    disabled={busy || !props.canControl}
                    onClick={() => void run("resume", job)}
                  >
                    Resume
                  </Button>
                ) : null}
                {live ? (
                  <Button
                    variant="secondary"
                    disabled={busy || !props.canControl}
                    onClick={() => void run("pause", job)}
                  >
                    Pause
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  disabled={busy || !props.canControl}
                  onClick={() => void run("cancel", job)}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => props.onOpen(job)}
                >
                  Open job
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function useWorkspaces(
  token: string,
  feed: {
    readonly jobs: readonly { workspacePath: string; workspaceLabel: string }[];
  },
) {
  const [repos, setRepos] = useState<RepoRow[]>([]);
  useEffect(() => {
    let alive = true;
    void getJson<ReposResponse>("/api/repos", token)
      .then((body) => {
        if (alive) setRepos(body.repos ?? []);
      })
      .catch(() => {
        /* Jobs still render from the feed; the filter just has fewer chips. */
      });
    return () => {
      alive = false;
    };
  }, [token, feed.jobs.length]);
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of feed.jobs) {
      counts.set(job.workspacePath, (counts.get(job.workspacePath) ?? 0) + 1);
    }
    if (repos.length > 0) {
      return repos.map((repo) => ({
        path: repo.path,
        label: repo.label,
        jobCount: counts.get(repo.path) ?? repo.jobCount ?? 0,
        ...(repo.error ? { error: repo.error } : {}),
      }));
    }
    return [...counts.entries()].map(([path, jobCount]) => ({
      path,
      label:
        feed.jobs.find((job) => job.workspacePath === path)?.workspaceLabel ??
        path,
      jobCount,
    }));
  }, [feed.jobs, repos]);
}
