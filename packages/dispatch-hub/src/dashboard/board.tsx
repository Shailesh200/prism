import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import type { HubEvent, JobSnapshot } from "../types.js";

type JobsResponse = { jobs: JobSnapshot[] };

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

  const control = async (job: JobSnapshot, action: string): Promise<void> => {
    await fetch(`/api/jobs/${encodeURIComponent(job.id)}/control`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, workspace: job.workspacePath }),
    });
  };

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
                </dl>
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
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
