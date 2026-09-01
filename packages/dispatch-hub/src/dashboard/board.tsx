import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  IN_FLIGHT_STATUSES,
  type HubEvent,
  type JobSnapshot,
} from "../types.js";

type JobsResponse = { jobs: JobSnapshot[] };

/** Why a console is blank, in words the reader can act on. */
function consoleErrorText(status: number): string {
  if (status === 401 || status === 403) {
    return "The hub rejected this request. Reopen the dashboard from Prism to get a fresh token.";
  }
  if (status === 400) {
    return "The hub does not know which workspace this job belongs to, so it cannot find its log.";
  }
  return `The hub could not return this console (HTTP ${status}).`;
}

/** One console line from /api/jobs/:id/logs (RunLogEntry shape). */
type ConsoleEntry = {
  ts: string;
  phase: string;
  text: string;
  tool?: string;
  /** Task tool_use id when this line is subagent work (M-066 P-P6). */
  parent?: string;
  level: "info" | "error";
};

function tokenFromPage(): string {
  const query = new URLSearchParams(window.location.search).get("token");
  if (query) {
    sessionStorage.setItem("prism-hub-token", query);
    return query;
  }
  return sessionStorage.getItem("prism-hub-token") ?? "";
}

function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function statusTone(job: JobSnapshot): string {
  if (job.status === "error" || job.verification === "failed") return "rose";
  if (job.status === "done" && job.verification === "passed") return "emerald";
  if (job.status === "done") return "brand";
  if (job.status === "waiting_on_you" || job.status === "blocked")
    return "amber";
  if (job.status === "paused" || job.status === "cancelled") return "muted";
  return "brand";
}

function canControl(job: JobSnapshot): boolean {
  return (
    job.status === "running" ||
    job.status === "booting" ||
    job.status === "ready" ||
    job.status === "paused" ||
    job.status === "waiting_on_you" ||
    job.status === "blocked"
  );
}

export function JobsBoard(): ReactElement {
  const token = useMemo(() => tokenFromPage(), []);
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [error, setError] = useState<string>("");
  const [consoleKey, setConsoleKey] = useState<string>("");
  const [logs, setLogs] = useState<Record<string, ConsoleEntry[]>>({});
  const [logErrors, setLogErrors] = useState<Record<string, string>>({});

  const applyEvent = useCallback((event: HubEvent) => {
    if (event.type === "snapshot") {
      setJobs([...event.jobs]);
      return;
    }
    setJobs((current) => {
      const rest = current.filter(
        (row) =>
          !(
            row.id === event.job.id &&
            row.workspacePath === event.job.workspacePath
          ),
      );
      return [...rest, event.job];
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/jobs", {
          headers: authHeaders(token),
        });
        if (!response.ok) {
          setError(
            response.status === 401
              ? "This board needs a Prism session."
              : "Could not load jobs.",
          );
          return;
        }
        const body = (await response.json()) as JobsResponse;
        if (!cancelled) {
          setJobs(body.jobs ?? []);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Could not reach the jobs board.");
      }
    };
    void load();
    const poll = window.setInterval(() => void load(), 2_000);

    let source: EventSource | undefined;
    try {
      const url = token
        ? `/api/events?token=${encodeURIComponent(token)}`
        : "/api/events";
      source = new EventSource(url);
      source.addEventListener("message", (message: MessageEvent<string>) => {
        try {
          applyEvent(JSON.parse(message.data) as HubEvent);
          setError("");
        } catch {
          /* ignore malformed frames */
        }
      });
    } catch {
      /* polling covers it */
    }

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      source?.close();
    };
  }, [applyEvent, token]);

  const control = async (
    job: JobSnapshot,
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> => {
    const response = await fetch(
      `/api/jobs/${encodeURIComponent(job.id)}/control`,
      {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          workspace: job.workspacePath,
          ...extra,
        }),
      },
    );
    if (!response.ok) return;
    const result = (await response.json()) as {
      needsConfirm?: boolean;
      message?: string;
    };
    if (result.needsConfirm && result.message) {
      if (window.confirm(result.message)) {
        await control(job, action, { ...extra, confirmDirty: true });
      }
    }
  };

  // Per-card console (M-066 P-P6): tails the job's run log while open.
  const toggleConsole = useCallback(
    async (job: JobSnapshot): Promise<void> => {
      const key = `${job.workspacePath}:${job.id}`;
      if (consoleKey === key) {
        setConsoleKey("");
        return;
      }
      setConsoleKey(key);
      const load = async (): Promise<void> => {
        try {
          const response = await fetch(
            `/api/jobs/${encodeURIComponent(job.id)}/logs?workspace=${encodeURIComponent(job.workspacePath)}`,
            { headers: authHeaders(token) },
          );
          if (!response.ok) {
            // Swallowing this rendered "no console output yet" for a 400 or a
            // 401, so a broken console was indistinguishable from a quiet job.
            setLogErrors((current) => ({
              ...current,
              [key]: consoleErrorText(response.status),
            }));
            return;
          }
          const body = (await response.json()) as { entries?: ConsoleEntry[] };
          setLogErrors((current) => ({ ...current, [key]: "" }));
          setLogs((current) => ({ ...current, [key]: body.entries ?? [] }));
        } catch (cause) {
          setLogErrors((current) => ({
            ...current,
            [key]: `Could not reach the hub (${cause instanceof Error ? cause.message : "network error"}).`,
          }));
        }
      };
      await load();
    },
    [consoleKey, token],
  );

  useEffect(() => {
    if (!consoleKey) return;
    const job = jobs.find(
      (row) => `${row.workspacePath}:${row.id}` === consoleKey,
    );
    if (!job) return;
    const refresh = window.setInterval(() => {
      void fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/logs?workspace=${encodeURIComponent(job.workspacePath)}`,
        { headers: authHeaders(token) },
      )
        .then(async (response) => {
          if (!response.ok) {
            setLogErrors((current) => ({
              ...current,
              [consoleKey]: consoleErrorText(response.status),
            }));
            return;
          }
          const body = (await response.json()) as { entries?: ConsoleEntry[] };
          setLogErrors((current) => ({ ...current, [consoleKey]: "" }));
          setLogs((current) => ({
            ...current,
            [consoleKey]: body.entries ?? [],
          }));
        })
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(refresh);
  }, [consoleKey, jobs, token]);

  const grouped = useMemo(() => {
    const map = new Map<string, JobSnapshot[]>();
    const sorted = [...jobs].toSorted((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    for (const job of sorted) {
      const list = map.get(job.workspacePath) ?? [];
      list.push(job);
      map.set(job.workspacePath, list);
    }
    return [...map.entries()];
  }, [jobs]);

  const running = jobs.filter(
    (job) =>
      job.status === "running" ||
      job.status === "booting" ||
      job.status === "ready",
  ).length;

  return (
    <div className="hub">
      <header className="hub-header">
        <div>
          <p className="hub-kicker">Prism Dispatch</p>
          <h1>Jobs</h1>
        </div>
        <p className="hub-meta">
          {running === 0 ? "Nothing running" : `${running} live`}
        </p>
      </header>
      {error ? <p className="hub-error">{error}</p> : null}
      {jobs.length === 0 && !error ? (
        <p className="ov-empty">
          Nothing running. Ask Prism in chat to start a teammate.
        </p>
      ) : null}
      {grouped.map(([path, list]) => (
        <section key={path} className="hub-repo">
          <h2>{list[0]?.workspaceLabel ?? path}</h2>
          <ul className="hub-list">
            {list.map((job) => (
              <li key={`${job.workspacePath}:${job.id}`} className="hub-card">
                <div className="hub-card-top">
                  <strong>{job.title}</strong>
                  <span className={`hub-pill hub-pill-${statusTone(job)}`}>
                    {job.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="hub-activity">
                  {job.lastActivity ||
                    job.resultSummary ||
                    job.errorMessage ||
                    "Waiting"}
                </p>
                <dl className="hub-facts">
                  <div>
                    <dt>Time</dt>
                    <dd>{formatElapsed(job.elapsedMs)}</dd>
                  </div>
                  <div>
                    <dt>Branch</dt>
                    <dd>
                      <code>{job.branch}</code>
                    </dd>
                  </div>
                  {job.placement ? (
                    <div>
                      <dt>Where</dt>
                      <dd>
                        {job.placement === "checkout"
                          ? "your checkout"
                          : "own worktree"}
                      </dd>
                    </div>
                  ) : null}
                  {job.verification ? (
                    <div>
                      <dt>Checks</dt>
                      <dd>{job.verification}</dd>
                    </div>
                  ) : null}
                  {job.commitSha ? (
                    <div>
                      <dt>Commit</dt>
                      <dd>
                        <code>{job.commitSha}</code>
                      </dd>
                    </div>
                  ) : null}
                  {job.review && job.review.files.length > 0 ? (
                    <div>
                      <dt>Changes</dt>
                      <dd>
                        {job.review.files.length}
                        {job.review.truncated ? "+" : ""} file
                        {job.review.files.length === 1 ? "" : "s"} +
                        {job.review.totalAdded} -{job.review.totalRemoved}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {job.verification === "failed" && job.verificationDetail ? (
                  <p className="hub-verify-failed">
                    Checks failed: {job.verificationDetail}
                  </p>
                ) : null}
                {job.waitingOn === "stalled" ? (
                  <p className="hub-verify-failed">
                    No recent output.{" "}
                    {job.nextStep || "Resume to nudge it, or cancel."}
                  </p>
                ) : null}
                {job.review && job.review.files.length > 0 ? (
                  <div className="hub-review">
                    <ul className="hub-review-files">
                      {job.review.files.map((file) => (
                        <li key={file.path}>
                          <code>{file.path}</code>
                          <span className="hub-review-change">
                            {file.change}
                          </span>
                          <span className="hub-review-churn">
                            +{file.added} -{file.removed}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="hub-review-note">
                      {job.review.branch
                        ? `On ${job.review.branch} — nothing merged into the branch you are on.`
                        : "Left for you to review — nothing was merged for you."}
                    </p>
                  </div>
                ) : null}
                {canControl(job) ? (
                  <div className="hub-actions">
                    {job.status === "paused" ? (
                      <button
                        type="button"
                        onClick={() => void control(job, "resume")}
                      >
                        Resume
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void control(job, "pause")}
                      >
                        Pause
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void control(job, "cancel")}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                <div className="hub-actions">
                  <button type="button" onClick={() => void toggleConsole(job)}>
                    {consoleKey === `${job.workspacePath}:${job.id}`
                      ? "Hide console"
                      : "Console"}
                  </button>
                </div>
                {consoleKey === `${job.workspacePath}:${job.id}` ? (
                  <div className="hub-console">
                    {logErrors[`${job.workspacePath}:${job.id}`] ? (
                      <p className="hub-console-empty hub-console-err">
                        {logErrors[`${job.workspacePath}:${job.id}`]}
                      </p>
                    ) : (logs[`${job.workspacePath}:${job.id}`] ?? [])
                        .length === 0 ? (
                      <p className="hub-console-empty">
                        {IN_FLIGHT_STATUSES.includes(job.status)
                          ? "Waiting for the teammate's first output…"
                          : "This job has no console log. Jobs started before console logging shipped never wrote one — a new job will."}
                      </p>
                    ) : (
                      (logs[`${job.workspacePath}:${job.id}`] ?? []).map(
                        (entry, index) => (
                          <p
                            key={`${entry.ts}-${index}`}
                            className={`hub-console-line${
                              entry.parent ? " hub-console-sub" : ""
                            }${entry.level === "error" ? " hub-console-err" : ""}`}
                          >
                            <span className="hub-console-phase">
                              {entry.parent ? "↳ " : ""}
                              {entry.phase}
                            </span>
                            {entry.text}
                          </p>
                        ),
                      )
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
