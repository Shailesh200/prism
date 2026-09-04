import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  JobConsolePage,
  JobControlAction,
  JobSummary,
  JobsPort,
} from "@repo-prism/app-shell";
import type { HubEvent, JobSnapshot, WorkspaceError } from "../types.js";
import { ConsoleRequestError, getJson, postJson } from "./session.js";

const POLL_MS = 2_000;

/**
 * How long without a successful read before the list is called stale.
 *
 * Three poll intervals: long enough that one dropped request does not flash a
 * warning, short enough that a dead daemon is admitted before the user acts on
 * numbers that stopped moving.
 */
export const STALE_AFTER_MS = POLL_MS * 3;

type JobsResponse = {
  readonly jobs: JobSnapshot[];
  readonly asOf: string;
  readonly errors: WorkspaceError[];
};

/**
 * A `JobSnapshot` as `JobsScreen` wants it.
 *
 * Everything optional is passed through only when present. Under
 * `exactOptionalPropertyTypes` that is not pedantry: writing `startedAt:
 * undefined` and omitting `startedAt` mean different things to the duration
 * helpers, and the difference is "unknown" versus "zero".
 */
export function toJobSummary(job: JobSnapshot): JobSummary {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    branch: job.branch,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    workspacePath: job.workspacePath,
    workspaceLabel: job.workspaceLabel,
    ...(job.queuedAt ? { queuedAt: job.queuedAt } : {}),
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    ...(job.lastActivity ? { lastActivity: job.lastActivity } : {}),
    ...(job.worktreePath ? { worktreePath: job.worktreePath } : {}),
    ...(job.lastHeartbeat ? { lastHeartbeat: job.lastHeartbeat } : {}),
    ...(job.placement ? { placement: job.placement } : {}),
    ...(job.workerBackend ? { workerBackend: job.workerBackend } : {}),
    ...(job.workerModel ? { workerModel: job.workerModel } : {}),
    ...(job.workerThinking ? { workerThinking: job.workerThinking } : {}),
    ...(job.notes?.length ? { notes: [...job.notes] } : {}),
    ...(job.citedMissing?.length
      ? { citedMissing: [...job.citedMissing] }
      : {}),
    ...(job.nextStep ? { nextStep: job.nextStep } : {}),
    ...(job.resultSummary ? { resultSummary: job.resultSummary } : {}),
    ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    ...(job.review ? { review: job.review } : {}),
    ...(job.verification ? { verification: job.verification } : {}),
    ...(job.verificationDetail
      ? { verificationDetail: job.verificationDetail }
      : {}),
    ...(job.confirm
      ? {
          confirm: {
            kind: job.confirm.kind,
            question: job.confirm.question,
            ...(job.confirm.dirtyPaths?.length
              ? { dirtyPaths: job.confirm.dirtyPaths }
              : {}),
            ...(job.confirm.overlapTitle
              ? { overlapTitle: job.confirm.overlapTitle }
              : {}),
          },
        }
      : {}),
  };
}

export type JobsFeed = {
  readonly port: JobsPort;
  readonly jobs: readonly JobSnapshot[];
  /** The same list `JobsScreen` renders, so the two cannot drift. */
  readonly summaries: readonly JobSummary[];
  readonly asOf: string;
  readonly stale: boolean;
  /** True until the first successful read — distinct from "empty". */
  readonly loading: boolean;
  readonly errors: readonly WorkspaceError[];
  readonly refresh: () => void;
  readonly fatal?: string;
};

/**
 * Decide whether a list is stale, given when we last heard from the Console.
 *
 * Pulled out as a function because "stale" is a claim about freshness, and a
 * claim the UI makes needs to be testable without a browser. Nothing is stale
 * before first contact — that state is "loading", which reads differently.
 */
export function isStale(
  lastContactAt: number | undefined,
  now: number,
  afterMs: number = STALE_AFTER_MS,
): boolean {
  if (lastContactAt === undefined) return false;
  return now - lastContactAt > afterMs;
}

/**
 * The live jobs feed: SSE when it works, polling when it does not.
 *
 * `stale` is the point of the fallback bookkeeping. When the stream drops and
 * polls start failing, the last list stays on screen — but flagged, rather
 * than presented as current (ADR-0048).
 */
export function useJobsFeed(token: string): JobsFeed {
  const [jobs, setJobs] = useState<readonly JobSnapshot[]>([]);
  const [asOf, setAsOf] = useState("");
  const [errors, setErrors] = useState<readonly WorkspaceError[]>([]);
  const [fatal, setFatal] = useState<string | undefined>();
  const [lastContactAt, setLastContactAt] = useState<number | undefined>();
  const [clock, setClock] = useState(() => Date.now());
  // `jobsRef` is written directly rather than mirrored from state, because
  // `port.listJobs` reads it right after awaiting a fetch — before React has
  // re-rendered — and must see what that fetch returned.
  const jobsRef = useRef<readonly JobSnapshot[]>([]);

  const commit = useCallback((next: readonly JobSnapshot[]) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  const applyEvent = useCallback(
    (event: HubEvent) => {
      setLastContactAt(Date.now());
      if (event.type === "snapshot") {
        commit(event.jobs);
        setAsOf(event.asOf);
        setErrors(event.errors ?? []);
        return;
      }
      if (event.type === "job.updated" || event.type === "job.finished") {
        const incoming = event.job;
        commit([
          ...jobsRef.current.filter(
            (row) =>
              !(
                row.id === incoming.id &&
                row.workspacePath === incoming.workspacePath
              ),
          ),
          incoming,
        ]);
        return;
      }
      if (event.type === "job.removed") {
        const gone = event.job;
        commit(
          jobsRef.current.filter(
            (row) =>
              !(row.id === gone.id && row.workspacePath === gone.workspacePath),
          ),
        );
      }
    },
    [commit],
  );

  const pull = useCallback(async () => {
    try {
      const body = await getJson<JobsResponse>("/api/jobs", token);
      commit(body.jobs ?? []);
      setAsOf(body.asOf ?? "");
      setErrors(body.errors ?? []);
      setFatal(undefined);
      setLastContactAt(Date.now());
    } catch (cause) {
      setFatal(
        cause instanceof ConsoleRequestError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    }
  }, [token, commit]);

  useEffect(() => {
    void pull();
  }, [pull]);

  useEffect(() => {
    // EventSource cannot set an Authorization header, so the token rides in
    // the query string here. The Console accepts both.
    const source = new EventSource(
      `/api/events?token=${encodeURIComponent(token)}`,
    );
    source.onopen = () => setLastContactAt(Date.now());
    source.onmessage = (message) => {
      try {
        applyEvent(JSON.parse(message.data) as HubEvent);
        setFatal(undefined);
      } catch {
        // A malformed frame is not worth tearing the page down over; the
        // poll below re-reads the whole list anyway.
      }
    };
    return () => source.close();
  }, [token, applyEvent]);

  useEffect(() => {
    const timer = setInterval(() => void pull(), POLL_MS);
    return () => clearInterval(timer);
  }, [pull]);

  // Staleness is a function of elapsed time, so it needs its own tick —
  // otherwise a Console that stops answering leaves a confident-looking board
  // frozen and unlabelled.
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const port = useMemo<JobsPort>(
    () => ({
      jobLogs: async (jobId: string): Promise<JobConsolePage> => {
        const workspace = jobsRef.current.find(
          (row) => row.id === jobId,
        )?.workspacePath;
        const query = workspace
          ? `?workspace=${encodeURIComponent(workspace)}`
          : "";
        return await getJson<JobConsolePage>(
          `/api/jobs/${encodeURIComponent(jobId)}/logs${query}`,
          token,
        );
      },
      jobNotes: async (jobId) => {
        const workspace = jobsRef.current.find(
          (row) => row.id === jobId,
        )?.workspacePath;
        const params = new URLSearchParams();
        if (workspace) params.set("workspace", workspace);
        const q = params.toString();
        return await getJson<{ notes: { path: string; title: string }[] }>(
          `/api/jobs/${encodeURIComponent(jobId)}/notes${q ? `?${q}` : ""}`,
          token,
        );
      },
      jobNote: async (jobId, path) => {
        const workspace = jobsRef.current.find(
          (row) => row.id === jobId,
        )?.workspacePath;
        const params = new URLSearchParams({ path });
        if (workspace) params.set("workspace", workspace);
        return await getJson<{
          path: string;
          text: string;
          truncated?: boolean;
        }>(`/api/jobs/${encodeURIComponent(jobId)}/notes?${params}`, token);
      },
      control: async (action: JobControlAction, jobId: string, extra) => {
        const workspace = jobsRef.current.find(
          (row) => row.id === jobId,
        )?.workspacePath;
        if (action === "delete") {
          commit(
            jobsRef.current.filter(
              (row) =>
                !(
                  row.id === jobId &&
                  (!workspace || row.workspacePath === workspace)
                ),
            ),
          );
        }
        const result = await postJson<{
          deleted?: boolean;
          message?: string;
        }>(`/api/jobs/${encodeURIComponent(jobId)}/control`, token, {
          action,
          ...(workspace ? { workspace } : {}),
          ...(extra?.path ? { path: extra.path } : {}),
        });
        if (action === "delete" && result.deleted !== true) {
          await pull();
          throw new ConsoleRequestError(
            400,
            result.message ?? "The Console could not delete that job.",
          );
        }
        await pull();
      },
    }),
    [token, pull],
  );

  const summaries = useMemo(() => jobs.map(toJobSummary), [jobs]);

  return {
    port,
    jobs,
    summaries,
    asOf,
    stale: isStale(lastContactAt, clock),
    loading: lastContactAt === undefined,
    errors,
    refresh: () => void pull(),
    ...(fatal ? { fatal } : {}),
  };
}
