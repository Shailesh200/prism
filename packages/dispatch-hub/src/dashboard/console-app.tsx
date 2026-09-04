import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { JobsScreen, jobsWaitingOnYou } from "@repo-prism/app-shell";
import { ConsoleFooter } from "./console-footer.js";
import { FindingsView } from "./findings-view.js";
import { IntelligenceView } from "./intelligence-view.js";
import { CONSOLE_VIEWS, useHashRoute, VIEW_LABELS } from "./router.js";
import { getJson, readToken } from "./session.js";
import { ConsoleToastHost } from "./console-toast.js";
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
  const waitingCount = jobsWaitingOnYou(feed.summaries).length;
  const workspaces = useWorkspaces(token, feed);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [version, setVersion] = useState<string | undefined>();
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
              {id === "jobs" && waitingCount > 0 ? (
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
