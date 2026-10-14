/**
 * `prism-mcp --hook stop` (ADR-0058).
 *
 * The plugin hook script stays dependency-free. When the agent stops it
 * spawns this, which opens the workspace, runs the receipt, and prints the
 * Claude Code hook JSON on stdout. Nothing else may write stdout.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Prism } from "@repo-prism/core";
import {
  appendEnvelopeLedger,
  envelopeFooter,
  envelopeReport,
  readEnvelopeLedger,
  writeLastPrepareChange,
} from "@repo-prism/core/envelope";
import {
  AUTO_PREPARE_BUDGET,
  type PrepareChange,
  type PrismError,
  type Result,
  err,
  looksLikeChangeRequest,
  ok,
  prepareIsAnchored,
  renderPrepareContext,
} from "@repo-prism/shared";
import { type Attach, daemonAttach } from "../daemon-attach.js";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import {
  buildChangeReceipt,
  receiptFeedback,
  renderReceipt,
} from "./receipt.js";

export type SessionStart = {
  readonly sessionId?: string;
  readonly startedAt?: string;
  /** Workspace-relative paths already changed when the session began. */
  readonly dirty?: readonly string[];
};

/** What the session-start hook recorded (`hooks/session.json`), if anything. */
export function readSessionStart(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): SessionStart | null {
  try {
    const raw = JSON.parse(
      readFileSync(
        join(workspacePrismDir(root, env), "hooks", "session.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    return {
      ...(typeof raw.sessionId === "string"
        ? { sessionId: raw.sessionId }
        : {}),
      ...(typeof raw.startedAt === "string"
        ? { startedAt: raw.startedAt }
        : {}),
      ...(Array.isArray(raw.dirty)
        ? {
            dirty: raw.dirty.filter(
              (p): p is string => typeof p === "string" && p.length > 0,
            ),
          }
        : {}),
    };
  } catch {
    return null;
  }
}

function readStdinJson(): Record<string, unknown> {
  try {
    const raw = readFileSync(0, "utf8");
    const parsed = raw.trim() ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Default time Prepare may take inside the prompt hook before it is skipped. */
export const AUTO_PREPARE_MS = 4000;

/**
 * `prism-mcp --hook prompt` (ADR-0065): when the prompt asks for a change,
 * inject a compact Prepare pack. Never blocks; an empty object means "say
 * nothing". The reason for a skip goes to stderr for the hook log.
 */
export async function autoPrepare(
  input: Record<string, unknown>,
  options: {
    readonly root?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly now?: () => number;
    /** Defaults to the daemon client; `null` forces the in-process path. */
    readonly attach?: Attach | null;
  } = {},
): Promise<Record<string, unknown>> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const started = now();
  const skip = (reason: string): Record<string, unknown> => {
    process.stderr.write(`prism-mcp: auto-prepare skipped (${reason})\n`);
    return {};
  };
  if (env.PRISM_AUTOPREPARE === "0") return skip("PRISM_AUTOPREPARE=0");
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  if (!looksLikeChangeRequest(prompt)) return skip("not a change request");
  const limitMs = Number(env.PRISM_AUTOPREPARE_MS ?? AUTO_PREPARE_MS);
  const root = resolve(options.root ?? process.cwd());
  const task = prompt.slice(0, 400);

  let via = "daemon";
  let prepared: Result<PrepareChange, PrismError>;
  const attach =
    options.attach === undefined ? daemonAttach(env) : options.attach;
  const attached = await attach?.(
    "prepare_change",
    root,
    { task, budget: AUTO_PREPARE_BUDGET },
    limitMs,
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

  if (!prepared.ok) return skip(prepared.error.message);
  const elapsed = now() - started;
  if (elapsed > limitMs) return skip(`took ${elapsed}ms, over ${limitMs}ms`);
  if (!prepareIsAnchored(prepared.value) && !prepared.value.ambiguous) {
    return skip("no file or symbol in the prompt matched the index");
  }
  const text = renderPrepareContext(prepared.value);
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
      ...(typeof input.session_id === "string"
        ? { sessionId: input.session_id }
        : {}),
    },
    env,
  ).catch(() => undefined);
  process.stderr.write(
    `prism-mcp: auto-prepare injected in ${elapsed}ms (${via})\n`,
  );
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: text,
    },
  };
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
        () => undefined,
      );
    }
    return prepared;
  } finally {
    workspace.close();
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
  const opened = Prism.create().openRepository(process.cwd());
  if (!opened.ok) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext: `Prism could not open this repository (${opened.error.message}).`,
        },
      })}\n`,
    );
    return;
  }
  try {
    const session = readSessionStart(opened.value.rootPath);
    const receipt = await buildChangeReceipt(opened.value, {
      ...(session?.dirty ? { preExistingChanges: session.dirty } : {}),
      ...(session?.sessionId ? { sessionId: session.sessionId } : {}),
    });
    if (!receipt.ok) {
      process.stdout.write(
        `${JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: `Prism could not build a change receipt (${receipt.error.message}).`,
          },
        })}\n`,
      );
      return;
    }
    const since = Date.parse(session?.startedAt ?? "");
    const ledger = await readEnvelopeLedger(opened.value.rootPath).catch(
      () => [],
    );
    const footer = envelopeFooter(
      envelopeReport(ledger, {
        since: Number.isFinite(since) ? since : Date.now() - 4 * 3600_000,
      }),
    );
    const result = footer
      ? { ...receipt.value, envelope: footer }
      : receipt.value;
    const text = renderReceipt(result);
    try {
      const dir = join(workspacePrismDir(opened.value.rootPath), "receipts");
      mkdirSync(dir, { recursive: true });
      appendFileSync(
        join(dir, "history.jsonl"),
        `${JSON.stringify({
          at: new Date().toISOString(),
          verdict: result.verdict,
          durationMs: result.durationMs,
          ...(session?.sessionId ? { sessionId: session.sessionId } : {}),
          text,
          receipt: result,
        })}\n`,
      );
    } catch {
      /* history must not block the receipt the agent reads */
    }
    const feedback = receiptFeedback(result);
    const payload = feedback
      ? {
          decision: "block",
          reason: feedback,
          hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: text,
          },
        }
      : {
          hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: text,
          },
        };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } finally {
    opened.value.close();
  }
}
