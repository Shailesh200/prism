/**
 * `prism-mcp --hook stop` (ADR-0058).
 *
 * The plugin hook script stays dependency-free. When the agent stops it
 * spawns this, which asks the daemon for the receipt (or builds it here when
 * no daemon answers) and prints the Claude Code hook JSON on stdout.
 * Nothing else may write stdout.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Prism } from "@repo-prism/core";
import {
  callDaemonRoute,
  daemonEnabled,
  type DaemonOutcome,
} from "@repo-prism/daemon";
import { recordEvent } from "@repo-prism/shared/events";
import {
  type ChangeReceipt,
  type PrismError,
  type Result,
  err,
} from "@repo-prism/shared";
import { daemonBuildId } from "../daemon-attach.js";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { receiptFeedback, renderReceipt } from "./receipt.js";
import { createReceiptService } from "./receipt-service.js";
import { promptContext } from "./prompt-context.js";
import {
  AUTO_PREPARE_MS,
  runPromptHook,
  UNSUPPORTED_LANGUAGE_NOTE,
  type PromptContext,
  type PromptContextRequest,
  type PromptFiles,
} from "@repo-prism/shared/prompt-hook";

function readStdinJson(): Record<string, unknown> {
  try {
    const raw = readFileSync(0, "utf8");
    const parsed = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (error) {
    recordEvent({
      event: "hook.stdin",
      outcome: "degraded",
      reason: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

export { AUTO_PREPARE_MS, UNSUPPORTED_LANGUAGE_NOTE };

export type DaemonPrompt = (
  root: string,
  request: PromptContextRequest,
  timeoutMs: number,
) => Promise<DaemonOutcome<PromptContext>>;

function defaultDaemonPrompt(env: NodeJS.ProcessEnv): DaemonPrompt | null {
  if (!daemonEnabled(env)) return null;
  return (root, request, timeoutMs) =>
    callDaemonRoute<PromptContext>({
      path: "/v1/prompt",
      root,
      args: request,
      env,
      buildId: daemonBuildId(),
      timeoutMs,
    });
}

/**
 * `prism-mcp --hook prompt`: the shared prompt hook (`runPromptHook`) with
 * the warm daemon's `/v1/prompt` for the file block, or an in-process index
 * only when the daemon is off (`PRISM_DAEMON=0`). Empty object means "say
 * nothing".
 */
export async function autoPrepare(
  input: Record<string, unknown>,
  options: {
    readonly root?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly now?: () => number;
    /** When the hook's budget started; the hook binary passes its own start. */
    readonly startedAt?: number;
    /** Defaults to the daemon client; `null` forces the in-process path. */
    readonly daemon?: DaemonPrompt | null;
  } = {},
): Promise<Record<string, unknown>> {
  const env = options.env ?? process.env;
  const root = resolve(options.root ?? process.cwd());
  const daemon =
    options.daemon === undefined ? defaultDaemonPrompt(env) : options.daemon;
  const files: PromptFiles = daemon
    ? {
        via: "daemon",
        call: (request, budget) => daemon(root, request, budget),
      }
    : {
        via: "in-process",
        call: async (request) => {
          const answer = await promptInProcess(root, request, env);
          return answer.ok
            ? { kind: "ok", value: answer.value }
            : { kind: "error", error: answer.error };
        },
      };
  return runPromptHook(input, {
    root,
    files,
    env,
    ...(options.now ? { now: options.now } : {}),
    ...(options.startedAt !== undefined
      ? { startedAt: options.startedAt }
      : {}),
  });
}

/** No daemon: open, index and build here, then close (the pre-M-095 path). */
async function promptInProcess(
  root: string,
  request: PromptContextRequest,
  env: NodeJS.ProcessEnv,
): Promise<Result<PromptContext, PrismError>> {
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) return opened;
  const workspace = opened.value;
  try {
    const indexed = await workspace.index();
    if (!indexed.ok) return err(indexed.error);
    return await promptContext(workspace, request, env);
  } finally {
    workspace.close();
  }
}

/** The stop hook's hard budget (plan P17): structural receipt only, under 1 s. */
export const STOP_BUDGET_MS = 900;

/**
 * `prism-mcp --hook stop` (plan §5.7 / P17): show the structural receipt at
 * once. Checks keep running in the daemon and land via `receipt` or the next
 * prompt. When the daemon is on but silent, degrade with an event — no
 * in-process hang (HOOK-P4). In-process only when the daemon is off.
 */
export async function stopHook(
  input: Record<string, unknown>,
  options: {
    readonly root?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly now?: () => number;
    /** Defaults to the daemon client; `null` forces the in-process path. */
    readonly daemon?: DaemonReceipt | null;
  } = {},
): Promise<Record<string, unknown>> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const started = now();
  const root = resolve(options.root ?? process.cwd());
  const sessionId =
    typeof input.session_id === "string" && input.session_id
      ? input.session_id
      : undefined;
  const quiet = (event: string, reason: string): Record<string, unknown> => {
    recordEvent(
      {
        event,
        outcome:
          event === "receipt.timeout" || event === "receipt.degraded"
            ? "skipped"
            : "error",
        reason,
        workspace: root,
        durationMs: now() - started,
      },
      { env },
    );
    return {};
  };

  const daemon =
    options.daemon === undefined ? defaultDaemonReceipt(env) : options.daemon;
  let receipt: ChangeReceipt | null = null;
  const daemonBudget = Math.max(100, STOP_BUDGET_MS - (now() - started) - 50);
  const fromDaemon = await daemon?.(root, sessionId, daemonBudget);
  if (fromDaemon?.kind === "ok") receipt = fromDaemon.value;
  else if (fromDaemon?.kind === "error") {
    return quiet("receipt.error", fromDaemon.error.message);
  } else if (daemon) {
    // Daemon enabled but no answer: degrade, do not hang in-process (HOOK-P4).
    const reason =
      fromDaemon?.kind === "unavailable"
        ? fromDaemon.reason
        : `no daemon answer within ${daemonBudget}ms`;
    return quiet("receipt.degraded", reason);
  }
  if (!receipt) {
    const built = await inProcessReceipt(
      root,
      sessionId,
      env,
      Math.max(100, STOP_BUDGET_MS - (now() - started) - 50),
    );
    if (!built.ok) return quiet("receipt.error", built.error.message);
    receipt = built.value;
  }
  // A finished structural receipt is always shown. The 900 ms budget caps the
  // daemon wait (and the plugin spawn); discarding a completed receipt would
  // only hide useful output on a cold in-process path (PRISM_DAEMON=0).

  // The receipt service attached the session value line (plan P13).
  const text = renderReceipt(receipt);
  appendReceiptHistory(root, receipt, text, env);
  recordEvent(
    {
      event: "hook.stop",
      outcome: "ok",
      workspace: root,
      durationMs: now() - started,
      detail: {
        id: receipt.id,
        verdict: receipt.verdict,
        checksState: receipt.checksState,
        mode: receipt.mode ?? "inproc",
      },
    },
    { env },
  );
  // Only a finished check run can ask the agent to keep going. The receipt
  // itself is for the user: Stop context would make the agent take another
  // turn just to answer it.
  const feedback =
    receipt.checksState === "done" ? receiptFeedback(receipt) : null;
  return feedback
    ? { decision: "block", reason: feedback, systemMessage: text }
    : { systemMessage: text };
}

export type DaemonReceipt = (
  root: string,
  sessionId: string | undefined,
  timeoutMs: number,
) => Promise<DaemonOutcome<ChangeReceipt>>;

function defaultDaemonReceipt(env: NodeJS.ProcessEnv): DaemonReceipt | null {
  if (!daemonEnabled(env)) return null;
  return (root, sessionId, timeoutMs) =>
    callDaemonRoute<ChangeReceipt>({
      path: "/v1/receipt",
      root,
      args: sessionId ? { sessionId } : {},
      env,
      buildId: daemonBuildId(),
      timeoutMs,
    });
}

/**
 * No daemon: structural receipt only (plan P17). Checks stay pending for a
 * later `receipt` call; the stop hook must not wait on them.
 */
async function inProcessReceipt(
  root: string,
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv,
  budgetMs: number,
): Promise<Result<ChangeReceipt, PrismError>> {
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) return opened;
  try {
    const service = createReceiptService({
      env,
      mode: "inproc",
      build: { checkTimeoutMs: budgetMs, totalTimeoutMs: budgetMs },
    });
    return await service.receipt(opened.value, sessionId ? { sessionId } : {});
  } finally {
    opened.value.close();
  }
}

function appendReceiptHistory(
  root: string,
  receipt: ChangeReceipt,
  text: string,
  env: NodeJS.ProcessEnv,
): void {
  try {
    const dir = join(workspacePrismDir(root, env), "receipts");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "history.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        verdict: receipt.verdict,
        durationMs: receipt.durationMs,
        ...(receipt.sessionId ? { sessionId: receipt.sessionId } : {}),
        text,
        receipt,
      })}\n`,
    );
  } catch (error) {
    // History is for `prism receipts`; the agent still gets its receipt.
    recordEvent(
      {
        event: "receipt.history",
        outcome: "degraded",
        reason: error instanceof Error ? error.message : String(error),
        workspace: root,
      },
      { env },
    );
  }
}

export async function runMcpHook(argv: readonly string[]): Promise<void> {
  const at = argv.indexOf("--hook");
  const event = argv[at + 1] ?? "stop";
  if (event === "prompt") {
    process.stdout.write(
      // The hook's budget includes this process's own start-up.
      `${JSON.stringify(await autoPrepare(readStdinJson(), { startedAt: Math.round(Date.now() - performance.now()) }))}\n`,
    );
    return;
  }
  if (event !== "stop") {
    process.stdout.write("{}\n");
    return;
  }
  process.stdout.write(`${JSON.stringify(await stopHook(readStdinJson()))}\n`);
}
