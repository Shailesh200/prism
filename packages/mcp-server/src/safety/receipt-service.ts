/**
 * The daemon's receipt (plan §5.7) and session baselines (plan §10 Phase 4).
 *
 * A session baseline is what was already changed when the session began, so
 * the receipt scores only this session's edits. The daemon records it with
 * the same git reader the receipt uses, without the hook's old 2 s limit.
 *
 * `receipt()` answers with the structural receipt at once and runs the checks
 * in the background; the next call with the same session and the same diff
 * returns the stored receipt, by then with the check results (dedupe key
 * `(sessionId, diffHash)`, R-C3).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readChangedPaths, type PrismWorkspace } from "@repo-prism/core";
import {
  PrismErrorCode,
  err,
  ok,
  prismError,
  sessionValue,
  type ChangeReceipt,
  type PrismError,
  type Result,
  type SessionValue,
  receiptSummaryLine,
} from "@repo-prism/shared";
import { recordEvent } from "@repo-prism/shared/events";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import {
  listStoredReceipts,
  readStoredReceipt,
  writeStoredReceipt,
} from "@repo-prism/shared/receipt-store";
import { readPrepareHistory } from "@repo-prism/core/prepare-history";
import {
  buildStructuralReceipt,
  completeReceipt,
  type BuildReceiptOptions,
} from "./receipt.js";
import { readSessionStore } from "@repo-prism/shared/session-store";
import {
  appendFeedback,
  feedbackTerms,
} from "@repo-prism/shared/feedback-store";

export type SessionBaseline = {
  readonly sessionId?: string;
  readonly startedAt: string;
  /** Workspace-relative paths already changed when the session began. */
  readonly dirty: readonly string[];
};

function sessionFile(
  root: string,
  sessionId: string,
  env: NodeJS.ProcessEnv,
): string {
  const key = createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
  return join(workspacePrismDir(root, env), "sessions", `${key}.json`);
}

/** The single-session file older hooks and `prism-mcp --hook stop` read. */
function latestSessionFile(root: string, env: NodeJS.ProcessEnv): string {
  return join(workspacePrismDir(root, env), "hooks", "session.json");
}

function parseBaseline(raw: string): SessionBaseline | null {
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (!data || typeof data !== "object" || !Array.isArray(data.dirty)) {
    return null;
  }
  return {
    ...(typeof data.sessionId === "string" && data.sessionId
      ? { sessionId: data.sessionId }
      : {}),
    startedAt:
      typeof data.startedAt === "string"
        ? data.startedAt
        : new Date(0).toISOString(),
    dirty: data.dirty.filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    ),
  };
}

function readBaselineFile(
  path: string,
  root: string,
  env: NodeJS.ProcessEnv,
): SessionBaseline | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let reason = "not a session baseline";
  try {
    const parsed = parseBaseline(raw);
    if (parsed) return parsed;
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  renameSync(path, `${path}.corrupt-${Date.now()}`);
  recordEvent(
    {
      event: "session.baseline_corrupt",
      outcome: "degraded",
      reason,
      workspace: root,
    },
    { env },
  );
  return null;
}

/**
 * The baseline for `sessionId`, or (no id) the latest one recorded. A
 * session never gets another session's baseline.
 */
export function readSessionBaseline(
  root: string,
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): SessionBaseline | null {
  if (sessionId) {
    const own = readBaselineFile(sessionFile(root, sessionId, env), root, env);
    if (own) return own;
  }
  const latest = readBaselineFile(latestSessionFile(root, env), root, env);
  if (!latest) return null;
  if (sessionId && latest.sessionId && latest.sessionId !== sessionId) {
    return null;
  }
  return latest;
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  renameSync(temp, path);
}

/**
 * Record what is already changed as this session's baseline. A resumed or
 * compacted session keeps its first baseline (same id → no rewrite).
 */
export function recordSessionBaseline(
  root: string,
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): Result<SessionBaseline & { readonly reused: boolean }, PrismError> {
  if (sessionId) {
    const prior = readBaselineFile(
      sessionFile(root, sessionId, env),
      root,
      env,
    );
    if (prior) return ok({ ...prior, reused: true });
  }
  const changed = readChangedPaths(root, {});
  if (changed === null) {
    return err(
      prismError(
        PrismErrorCode.UNSUPPORTED,
        "Cannot record a session baseline: not a git work tree, or git is unavailable",
      ),
    );
  }
  const baseline: SessionBaseline = {
    ...(sessionId ? { sessionId } : {}),
    startedAt: now().toISOString(),
    dirty: [...changed.paths].sort(),
  };
  if (sessionId) writeJsonAtomic(sessionFile(root, sessionId, env), baseline);
  writeJsonAtomic(latestSessionFile(root, env), baseline);
  return ok({ ...baseline, reused: false });
}

/** Earlier receipts read for caught issues and suggested checks. */
const VALUE_RECEIPT_SAMPLE = 50;

/**
 * What Prism did this session (plan P13): files the session store says it
 * sent, and this session's earlier receipts.
 */
function sessionValueFor(
  root: string,
  receipt: ChangeReceipt,
  env: NodeJS.ProcessEnv,
): SessionValue {
  const id = receipt.sessionId;
  const filesCovered = id
    ? Object.values(readSessionStore(id, env).sent).filter(
        (entry) => entry.kind === "file",
      ).length
    : 0;
  const earlier = id
    ? listStoredReceipts(root, env, VALUE_RECEIPT_SAMPLE).filter(
        (r) => r.sessionId === id && r.id !== receipt.id,
      )
    : [];
  return sessionValue({ filesCovered, current: receipt, earlier });
}

export type ReceiptRequest = {
  readonly sessionId?: string;
  /** Overrides the recorded baseline (a job's own pre-existing list). */
  readonly preExistingChanges?: readonly string[];
  /** Wait this long for background checks before answering (default 0). */
  readonly waitMs?: number;
  readonly runChecks?: boolean;
  /**
   * Re-index before the structural pass. Default true for an explicit
   * `receipt` tool call. The warm-daemon stop route sets false (plan P17):
   * the watcher already keeps the index fresh, and stop must stay under 1 s.
   */
  readonly reindex?: boolean;
};

export type ReceiptService = {
  receipt(
    workspace: PrismWorkspace,
    request: ReceiptRequest,
  ): Promise<Result<ChangeReceipt, PrismError>>;
  /** Background check runs still going (tests and shutdown). */
  pending(): readonly Promise<ChangeReceipt>[];
  /**
   * The stored receipt `id`, waiting up to `waitMs` for its check run
   * (round 4, the session-end verdict). Read-only: it never builds a receipt
   * or starts checks, so a poll cannot run a suite for a newer diff.
   * `running` is false once nothing is checking that receipt any more.
   */
  settle(
    root: string,
    id: string,
    waitMs: number,
  ): Promise<{ receipt: ChangeReceipt | null; running: boolean }>;
};

export function createReceiptService(
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly mode?: ChangeReceipt["mode"];
    readonly build?: Omit<
      BuildReceiptOptions,
      "sessionId" | "preExistingChanges" | "runChecks" | "env"
    >;
  } = {},
): ReceiptService {
  const env = options.env ?? process.env;
  const mode = options.mode ?? "daemon";
  const running = new Map<string, Promise<ChangeReceipt>>();
  /**
   * One background check run per workspace (round 2). Each stop starts a run
   * of several minutes; a quick next turn used to stack three or four full
   * test suites, which starved the daemon and every hook behind it. A newer
   * change cancels the older run, whose receipt ends `superseded`.
   */
  const latestRun = new Map<string, AbortController>();
  /**
   * Per workspace: the last check run that finished after its stop answered
   * `still_running`, until a receipt reports it as `earlier`. Superseded runs
   * are not kept: a newer change replaced them.
   */
  const unreported = new Map<string, ChangeReceipt>();
  const withEarlier = (root: string, r: ChangeReceipt): ChangeReceipt => {
    const done = unreported.get(root);
    if (!done) return r;
    if (r.checksState === "pending" && done.id === r.id) return r;
    unreported.delete(root);
    if (done.id === r.id) return r;
    return {
      ...r,
      earlier: {
        id: done.id,
        verdict: done.verdict,
        ...(done.reason ? { reason: done.reason } : {}),
        summary: receiptSummaryLine(done).replace(/^Prism receipt: /, ""),
      },
    };
  };

  const store = (root: string, receipt: ChangeReceipt): void => {
    writeStoredReceipt(root, receipt, env);
  };

  return {
    pending: () => [...running.values()],
    async settle(root, id, waitMs) {
      const inFlight = running.get(id);
      const stored = readStoredReceipt(root, id, env);
      const receipt =
        inFlight && waitMs > 0 && stored
          ? await within(inFlight, waitMs, stored)
          : stored;
      // Shown now, so the next receipt does not repeat it as `earlier`.
      if (receipt && receipt.checksState !== "pending") {
        if (unreported.get(root)?.id === id) unreported.delete(root);
      }
      return { receipt, running: running.has(id) };
    },
    async receipt(workspace, request) {
      const root = workspace.rootPath;
      const started = Date.now();
      const baseline = request.preExistingChanges
        ? null
        : readSessionBaseline(root, request.sessionId, env);
      const preExisting = request.preExistingChanges ?? baseline?.dirty;
      const buildOptions: BuildReceiptOptions = {
        ...options.build,
        env,
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        ...(preExisting ? { preExistingChanges: preExisting } : {}),
        ...(request.runChecks === false ? { runChecks: false } : {}),
        ...(request.reindex === false ? { reindex: false } : {}),
      };
      const structural = await buildStructuralReceipt(workspace, buildOptions);
      if (!structural.ok) return structural;
      const { receipt } = structural.value;

      const stored = readStoredReceipt(root, receipt.id, env);
      const inFlight = running.get(receipt.id);
      if (stored && (stored.checksState !== "pending" || inFlight)) {
        recordEvent(
          {
            event: "receipt.dedupe",
            outcome: "ok",
            workspace: root,
            durationMs: Date.now() - started,
            detail: { id: receipt.id, checksState: stored.checksState },
          },
          { env },
        );
        if (inFlight && request.waitMs) {
          return ok(
            withEarlier(root, await within(inFlight, request.waitMs, stored)),
          );
        }
        return ok(withEarlier(root, stored));
      }

      const withValue = async (r: ChangeReceipt): Promise<ChangeReceipt> => {
        try {
          return { ...r, value: sessionValueFor(root, r, env) };
        } catch (error) {
          recordEvent(
            {
              event: "receipt.value",
              outcome: "degraded",
              reason: error instanceof Error ? error.message : String(error),
              workspace: root,
            },
            { env },
          );
          return r;
        }
      };
      const first = await withValue({ ...receipt, mode });
      store(root, first);
      recordEvent(
        {
          event: "receipt.build",
          outcome: "ok",
          workspace: root,
          durationMs: Date.now() - started,
          detail: {
            id: receipt.id,
            verdict: receipt.verdict,
            checksState: receipt.checksState,
          },
        },
        { env },
      );
      // P6: record suggested vs edited (paths + terms only).
      void recordPrepareFeedback(root, first, env).catch((error: unknown) => {
        recordEvent(
          {
            event: "feedback.write",
            outcome: "degraded",
            reason: error instanceof Error ? error.message : String(error),
            workspace: root,
          },
          { env },
        );
      });
      if (!structural.value.plan) return ok(withEarlier(root, first));

      latestRun.get(root)?.abort();
      const controller = new AbortController();
      latestRun.set(root, controller);
      const checks = completeReceipt(structural.value, {
        ...buildOptions,
        signal: controller.signal,
      })
        .then(async (done) => {
          const final = await withValue({ ...done, mode });
          store(root, final);
          if (final.reason !== "superseded") unreported.set(root, final);
          recordEvent(
            {
              event: "receipt.checks",
              outcome: "ok",
              workspace: root,
              durationMs: final.durationMs,
              detail: {
                id: final.id,
                verdict: final.verdict,
                ...(final.reason ? { reason: final.reason } : {}),
              },
            },
            { env },
          );
          return final;
        })
        .catch((error: unknown) => {
          // The checks could not run at all: say so on the stored receipt
          // rather than leave it "still running" for ever.
          const reason = error instanceof Error ? error.message : String(error);
          recordEvent(
            {
              event: "receipt.checks",
              outcome: "error",
              reason,
              workspace: root,
              detail: { id: first.id },
            },
            { env },
          );
          const failed: ChangeReceipt = {
            ...first,
            checksState: "done",
            verdict: "not_proven",
            reason: "unknown_runner",
          };
          store(root, failed);
          unreported.set(root, failed);
          return failed;
        })
        .finally(() => {
          running.delete(receipt.id);
          if (latestRun.get(root) === controller) latestRun.delete(root);
        });
      running.set(receipt.id, checks);
      if (request.waitMs)
        return ok(
          withEarlier(root, await within(checks, request.waitMs, first)),
        );
      return ok(withEarlier(root, first));
    },
  };
}

async function within<T>(
  work: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** P6: one feedback row from the latest prepare pack vs this receipt's edits. */
async function recordPrepareFeedback(
  root: string,
  receipt: ChangeReceipt,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const edited = receipt.touched.files;
  if (edited.length === 0) return;
  const history = await readPrepareHistory(root, env).catch(() => []);
  const latest = history[0];
  const suggested = (latest?.packFiles ?? []).slice(0, 10).map((f) => f.path);
  const terms = feedbackTerms(latest?.task ?? "");
  appendFeedback(
    root,
    {
      ts: new Date().toISOString(),
      suggested,
      edited: [...edited],
      terms,
    },
    env,
  );
}
