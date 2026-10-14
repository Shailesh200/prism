/**
 * `prism-mcp --hook stop` (ADR-0058).
 *
 * The plugin hook script stays dependency-free. When the agent stops it
 * spawns this, which asks the daemon for the receipt (or builds it here when
 * no daemon answers) and prints the Claude Code hook JSON on stdout.
 * Nothing else may write stdout.
 */

import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Prism } from "@repo-prism/core";
import {
  appendEnvelopeLedger,
  envelopeFooter,
  envelopeReport,
  readEnvelopeLedger,
  writeLastPrepareChange,
} from "@repo-prism/core/envelope";
import {
  callDaemonRoute,
  daemonEnabled,
  daemonReady,
  type DaemonOutcome,
} from "@repo-prism/daemon";
import { recordEvent } from "@repo-prism/shared/events";
import {
  AUTO_PREPARE_BUDGET,
  type ChangeReceipt,
  type PrepareChange,
  type PrismError,
  type Result,
  err,
  looksLikeChangeRequest,
  ok,
  chooseLensDetailed,
  prepareIsAnchored,
  renderPrepareContext,
  type PrepareContextExtras,
} from "@repo-prism/shared";
import {
  applyDefaultProcedures,
  DEFAULT_LENSES,
  readLensStore,
} from "@repo-prism/shared/lens-store";
import { type Attach, daemonAttach, daemonBuildId } from "../daemon-attach.js";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { receiptFeedback, renderReceipt } from "./receipt.js";
import {
  createReceiptService,
  readSessionBaseline,
} from "./receipt-service.js";

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

/** Default time Prepare may take inside the prompt hook before it is skipped. */
export const AUTO_PREPARE_MS = 3500;
/** Longest the prompt hook waits for the daemon's first index (HK-6). */
export const READY_WAIT_MS = 3000;

/**
 * `prism-mcp --hook prompt` (ADR-0065, plan §5.8 H-PROMPT): when the prompt
 * asks for a change, wait up to 3 s for the daemon's index, then inject a
 * Prepare pack (budget 1,200). Never blocks; an empty object means "say
 * nothing". The reason for a skip goes to stderr for the hook log and to
 * the event log.
 */
export async function autoPrepare(
  input: Record<string, unknown>,
  options: {
    readonly root?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly now?: () => number;
    /** Defaults to the daemon client; `null` forces the in-process path. */
    readonly attach?: Attach | null;
    /** Defaults to the daemon's readiness probe; `null` skips the wait. */
    readonly ready?: ReadyProbe | null;
  } = {},
): Promise<Record<string, unknown>> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const started = now();
  const root = resolve(options.root ?? process.cwd());
  const skip = (
    reason: string,
    event = "prompt.skipped",
  ): Record<string, unknown> => {
    process.stderr.write(`prism-mcp: auto-prepare skipped (${reason})\n`);
    recordEvent(
      {
        event,
        outcome: "skipped",
        reason,
        workspace: root,
        durationMs: now() - started,
      },
      { env },
    );
    return {};
  };
  const mode = env.PRISM_AUTOPREPARE;
  if (mode === "0" || mode === "off") return skip("PRISM_AUTOPREPARE off");
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  if (!looksLikeChangeRequest(prompt)) return skip("not a change request");
  const limitMs = Number(env.PRISM_AUTOPREPARE_MS ?? AUTO_PREPARE_MS);
  const task = prompt.slice(0, 400);
  const sessionId =
    typeof input.session_id === "string" && input.session_id
      ? input.session_id
      : undefined;

  let via = "daemon";
  let prepared: Result<PrepareChange, PrismError>;
  const attach =
    options.attach === undefined ? daemonAttach(env) : options.attach;
  const ready =
    options.ready === undefined
      ? attach
        ? defaultReadyProbe(env)
        : null
      : options.ready;
  if (ready) {
    const answer = await ready(root, READY_WAIT_MS);
    if (answer.kind === "ok" && !answer.value.ready) {
      // HK-7: nothing now; the next change prompt in the session retries.
      return skip(
        `index not ready (${answer.value.state})`,
        "prompt.not_ready",
      );
    }
    if (answer.kind === "ok") {
      recordEvent(
        {
          event: "prompt.waited",
          outcome: "ok",
          workspace: root,
          durationMs: now() - started,
        },
        { env },
      );
    }
  }
  const attached = await attach?.(
    "prepare_change",
    root,
    { task, budget: AUTO_PREPARE_BUDGET },
    Math.max(500, limitMs - (now() - started)),
  );
  if (attached?.kind === "ok") {
    // The daemon's tool already recorded this as the last Prepare.
    prepared = ok(attached.value as PrepareChange);
  } else if (attached?.kind === "error") {
    prepared = err(attached.error);
  } else {
    via = "in-process";
    prepared = await prepareInProcess(root, task, env);
  }

  if (!prepared.ok) {
    const details = prepared.error.details as { reason?: unknown } | undefined;
    if (details?.reason === "language") {
      // §4.6: an unsupported-language repo gets one line, once per session.
      if (sessionId && !markSessionOnce(root, sessionId, "language", env)) {
        return skip("unsupported language (note already given)");
      }
      return {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: UNSUPPORTED_LANGUAGE_NOTE,
        },
      };
    }
    return skip(prepared.error.message);
  }
  const elapsed = now() - started;
  if (elapsed > limitMs) return skip(`took ${elapsed}ms, over ${limitMs}ms`);
  if (!prepareIsAnchored(prepared.value) && !prepared.value.ambiguous) {
    return skip("no file or symbol in the prompt matched the index");
  }
  const extras: PrepareContextExtras = {
    ...(await lensFor(root, prompt, sessionId, env)),
    ...(await blastLine(
      root,
      prepared.value,
      attach,
      via,
      limitMs - (now() - started),
    )),
  };
  const text = renderPrepareContext(prepared.value, extras);
  if (sessionId) writeSessionPack(root, sessionId, prepared.value, env);
  await appendEnvelopeLedger(
    root,
    {
      ts: new Date().toISOString(),
      tool: "prepare_change",
      itemCount: prepared.value.pack.files.length,
      totalCount: prepared.value.pack.totalCount,
      truncated: prepared.value.pack.truncated,
      limit: AUTO_PREPARE_BUDGET,
      jsonBytes: Buffer.byteLength(text, "utf8"),
      source: "hook",
      ...(sessionId ? { sessionId } : {}),
    },
    env,
  ).catch((error: unknown) => {
    recordEvent(
      {
        event: "prompt.envelope",
        outcome: "degraded",
        reason: error instanceof Error ? error.message : String(error),
        workspace: root,
      },
      { env },
    );
  });
  process.stderr.write(
    `prism-mcp: auto-prepare injected in ${elapsed}ms (${via})\n`,
  );
  recordEvent(
    {
      event: "prompt.injected",
      outcome: "ok",
      workspace: root,
      durationMs: elapsed,
      detail: { via },
    },
    { env },
  );
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: text,
    },
  };
}

/** §4.6 / H-PROMPT: the line an unsupported repository gets instead of a pack. */
export const UNSUPPORTED_LANGUAGE_NOTE =
  "Prism: this repository's language is not supported in 2.0; no pack.";

/**
 * True the first time `what` is marked for this session, false after. Keyed
 * by a hash of the session id, so two sessions never share a mark.
 */
function markSessionOnce(
  root: string,
  sessionId: string,
  what: string,
  env: NodeJS.ProcessEnv,
): boolean {
  const key = createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
  const path = join(
    workspacePrismDir(root, env),
    "hooks",
    "once",
    `${key}.json`,
  );
  let marks: string[] = [];
  try {
    marks = JSON.parse(readFileSync(path, "utf8")) as string[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      recordEvent(
        {
          event: "prompt.session_marks",
          outcome: "degraded",
          reason: error instanceof Error ? error.message : String(error),
          workspace: root,
        },
        { env },
      );
    }
  }
  if (!Array.isArray(marks)) marks = [];
  if (marks.includes(what)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...marks, what]));
  return true;
}

/** The task's lens with its procedure, once per session (plan §5.3, §5.8). */
async function lensFor(
  root: string,
  prompt: string,
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<Pick<PrepareContextExtras, "lens">> {
  const store = await readLensStore(root, env);
  const lenses = applyDefaultProcedures(
    store.lenses.length > 0 ? store.lenses : DEFAULT_LENSES,
  );
  const choice = chooseLensDetailed(prompt, lenses);
  if (!choice) return {};
  if (choice.conflict && choice.conflict.length > 1) {
    recordEvent(
      {
        event: "lens.conflict",
        outcome: "ok",
        workspace: root,
        detail: {
          chosen: choice.lens.id,
          candidates: choice.conflict.join(","),
        },
      },
      { env },
    );
  }
  if (
    sessionId &&
    !markSessionOnce(root, sessionId, `lens:${choice.lens.id}`, env)
  ) {
    return {};
  }
  return {
    lens: {
      id: choice.lens.id,
      name: choice.lens.name,
      procedure: choice.lens.procedure,
      ...(choice.conflict ? { conflict: choice.conflict } : {}),
    },
  };
}

/** One line on how far a change to the top file reaches, if there is time. */
async function blastLine(
  root: string,
  prepared: PrepareChange,
  attach: Attach | null | undefined,
  via: string,
  remainingMs: number,
): Promise<Pick<PrepareContextExtras, "blast">> {
  const top = prepared.pack.files[0]?.path;
  if (!top || remainingMs < 400) return {};
  const args = { kind: "file", id: top };
  let report: {
    readonly affectedFiles?: readonly unknown[] | undefined;
    readonly band?: string | undefined;
    readonly testsLikelyAffected?: readonly unknown[] | undefined;
  } | null = null;
  if (via === "daemon" && attach) {
    const answer = await attach("blast_radius", root, args, remainingMs);
    if (answer?.kind === "ok") report = answer.value as typeof report;
  } else {
    const opened = Prism.create().openRepository(root);
    if (opened.ok) {
      try {
        const blast = await opened.value.blastRadius({ kind: "file", id: top });
        if (blast.ok) report = blast.value;
      } finally {
        opened.value.close();
      }
    }
  }
  if (!report) return {};
  const files = report.affectedFiles?.length ?? 0;
  const tests = report.testsLikelyAffected?.length ?? 0;
  return {
    blast: `${top} reaches ${files} file${files === 1 ? "" : "s"} and ${tests} test${tests === 1 ? "" : "s"}${report.band ? ` (${report.band})` : ""}`,
  };
}

export type ReadyProbe = (
  root: string,
  waitMs: number,
) => Promise<
  DaemonOutcome<{ readonly ready: boolean; readonly state: string }>
>;

function defaultReadyProbe(env: NodeJS.ProcessEnv): ReadyProbe {
  return (root, waitMs) =>
    daemonReady({ root, waitMs, env, buildId: daemonBuildId() });
}

/**
 * This session's pack, for the pre-edit hook's outside-pack note (R-C5).
 * Keyed by session so two sessions never share one.
 */
function writeSessionPack(
  root: string,
  sessionId: string,
  prepared: PrepareChange,
  env: NodeJS.ProcessEnv,
): void {
  const key = createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
  const path = join(
    workspacePrismDir(root, env),
    "hooks",
    "packs",
    `${key}.json`,
  );
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        sessionId,
        generatedAt: new Date().toISOString(),
        packFiles: prepared.pack.files.map((f) => ({ path: f.path })),
      }),
    );
  } catch (error) {
    recordEvent(
      {
        event: "prompt.session_pack",
        outcome: "degraded",
        reason: error instanceof Error ? error.message : String(error),
        workspace: root,
      },
      { env },
    );
  }
}

/** No daemon: open, index and prepare here, then close (the pre-M-095 path). */
async function prepareInProcess(
  root: string,
  task: string,
  env: NodeJS.ProcessEnv,
): Promise<Result<PrepareChange, PrismError>> {
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) return opened;
  const workspace = opened.value;
  try {
    const indexed = await workspace.index();
    if (!indexed.ok) return err(indexed.error);
    const prepared = await workspace.prepareChange({
      task,
      budget: AUTO_PREPARE_BUDGET,
    });
    if (prepared.ok) {
      await writeLastPrepareChange(root, prepared.value, env).catch(
        (error: unknown) => {
          recordEvent(
            {
              event: "prompt.last_prepare",
              outcome: "degraded",
              reason: error instanceof Error ? error.message : String(error),
              workspace: root,
            },
            { env },
          );
        },
      );
    }
    return prepared;
  } finally {
    workspace.close();
  }
}

/** The stop hook's hard budget (plan §5.7): past it, say nothing. */
export const STOP_BUDGET_MS = 10_000;

/**
 * `prism-mcp --hook stop`: the receipt for this session, from the daemon if
 * one answers, else built here (plan §2.1 fallback, never npx). The agent
 * gets the receipt text or nothing: an error is logged as an event, never
 * shown raw (R-C4).
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
        outcome: event === "receipt.timeout" ? "skipped" : "error",
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
  const fromDaemon = await daemon?.(root, sessionId, STOP_BUDGET_MS - 1_000);
  if (fromDaemon?.kind === "ok") receipt = fromDaemon.value;
  else if (fromDaemon?.kind === "error") {
    return quiet("receipt.error", fromDaemon.error.message);
  }
  if (!receipt) {
    const built = await inProcessReceipt(
      root,
      sessionId,
      env,
      Math.max(1_000, STOP_BUDGET_MS - (now() - started) - 500),
    );
    if (!built.ok) return quiet("receipt.error", built.error.message);
    receipt = built.value;
  }
  if (now() - started > STOP_BUDGET_MS) {
    return quiet("receipt.timeout", `took ${now() - started}ms`);
  }

  const baseline = readSessionBaseline(root, sessionId, env);
  const since = Date.parse(baseline?.startedAt ?? "");
  const ledger = await readEnvelopeLedger(root).catch((error: unknown) => {
    recordEvent(
      {
        event: "receipt.envelope",
        outcome: "degraded",
        reason: error instanceof Error ? error.message : String(error),
        workspace: root,
      },
      { env },
    );
    return [];
  });
  const footer = envelopeFooter(
    envelopeReport(ledger, {
      since: Number.isFinite(since) ? since : Date.now() - 4 * 3600_000,
    }),
  );
  const result = footer ? { ...receipt, envelope: footer } : receipt;
  const text = renderReceipt(result);
  appendReceiptHistory(root, result, text, env);
  recordEvent(
    {
      event: "hook.stop",
      outcome: "ok",
      workspace: root,
      durationMs: now() - started,
      detail: {
        id: result.id,
        verdict: result.verdict,
        checksState: result.checksState,
        mode: result.mode ?? "inproc",
      },
    },
    { env },
  );
  // Only a finished check run can ask the agent to keep going.
  const feedback =
    result.checksState === "done" ? receiptFeedback(result) : null;
  return feedback
    ? {
        decision: "block",
        reason: feedback,
        hookSpecificOutput: { hookEventName: "Stop", additionalContext: text },
      }
    : {
        hookSpecificOutput: { hookEventName: "Stop", additionalContext: text },
      };
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
 * No daemon: build the receipt here and wait for its checks, each held to
 * the time left in the stop budget, so nothing outlives this process.
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
    const first = await service.receipt(
      opened.value,
      sessionId ? { sessionId } : {},
    );
    if (!first.ok) return first;
    const [running] = service.pending();
    return running ? ok(await running) : first;
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
      `${JSON.stringify(await autoPrepare(readStdinJson()))}\n`,
    );
    return;
  }
  if (event !== "stop") {
    process.stdout.write("{}\n");
    return;
  }
  process.stdout.write(`${JSON.stringify(await stopHook(readStdinJson()))}\n`);
}
