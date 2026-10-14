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
  type ChangeReceipt,
  type PrismError,
  type Result,
} from "@repo-prism/shared";
import { recordEvent } from "@repo-prism/shared/events";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import {
  readStoredReceipt,
  writeStoredReceipt,
} from "@repo-prism/shared/receipt-store";
import {
  buildStructuralReceipt,
  completeReceipt,
  type BuildReceiptOptions,
} from "./receipt.js";

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

export type ReceiptRequest = {
  readonly sessionId?: string;
  /** Overrides the recorded baseline (a job's own pre-existing list). */
  readonly preExistingChanges?: readonly string[];
  /** Wait this long for background checks before answering (default 0). */
  readonly waitMs?: number;
  readonly runChecks?: boolean;
};

export type ReceiptService = {
  receipt(
    workspace: PrismWorkspace,
    request: ReceiptRequest,
  ): Promise<Result<ChangeReceipt, PrismError>>;
  /** Background check runs still going (tests and shutdown). */
  pending(): readonly Promise<ChangeReceipt>[];
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

  const store = (root: string, receipt: ChangeReceipt): void => {
    writeStoredReceipt(root, receipt, env);
  };

  return {
    pending: () => [...running.values()],
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
          return ok(await within(inFlight, request.waitMs, stored));
        }
        return ok(stored);
      }

      const first: ChangeReceipt = { ...receipt, mode };
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
      if (!structural.value.plan) return ok(first);

      const checks = completeReceipt(structural.value, buildOptions)
        .then((done) => {
          const final: ChangeReceipt = { ...done, mode };
          store(root, final);
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
          return failed;
        })
        .finally(() => running.delete(receipt.id));
      running.set(receipt.id, checks);
      if (request.waitMs)
        return ok(await within(checks, request.waitMs, first));
      return ok(first);
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
