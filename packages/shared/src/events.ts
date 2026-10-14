/**
 * `~/.prism/events.jsonl`: the one place Prism records what a hook, the
 * daemon or the snapshot writer did (plan §2.5). Every caught failure in those
 * paths becomes an event with an outcome and a reason, never a silent catch.
 *
 * The file rotates at 5 MB and keeps three generations
 * (`events.jsonl`, `.1`, `.2`). The plugin's zero-dependency hook writes the
 * same line shape; `events.contract.test.ts` holds both to it.
 *
 * Import from `@repo-prism/shared/events`; this file uses `node:fs`.
 */
import {
  appendFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { prismHomeDir } from "./prism-home.js";

export const EVENT_OUTCOMES = ["ok", "skipped", "degraded", "error"] as const;
export type EventOutcome = (typeof EVENT_OUTCOMES)[number];

export const EVENTS_MAX_BYTES = 5 * 1024 * 1024;
export const EVENTS_GENERATIONS = 3;

export type PrismEvent = {
  /** Dotted name, e.g. `hook.session_start`, `install.missing_bin`. */
  readonly event: string;
  readonly outcome: EventOutcome;
  /** Required unless outcome is `ok`. */
  readonly reason?: string;
  readonly workspace?: string;
  readonly durationMs?: number;
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
};

export type EventLine = PrismEvent & {
  readonly ts: string;
  readonly pid: number;
};

export function eventsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHomeDir(env), "events.jsonl");
}

function rotate(path: string, maxBytes: number): void {
  let size: number;
  try {
    size = statSync(path).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (size < maxBytes) return;
  rmSync(`${path}.${EVENTS_GENERATIONS - 1}`, { force: true });
  for (let n = EVENTS_GENERATIONS - 2; n >= 1; n -= 1) {
    try {
      renameSync(`${path}.${n}`, `${path}.${n + 1}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  renameSync(path, `${path}.1`);
}

/**
 * Appends one event. Returns false when the log itself cannot be written; the
 * caller decides whether that matters (a hook must still answer its host).
 */
export function recordEvent(
  input: PrismEvent,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly now?: Date;
    readonly maxBytes?: number;
  } = {},
):
  | { readonly written: true }
  | { readonly written: false; readonly reason: string } {
  if (input.outcome !== "ok" && !input.reason) {
    throw new Error(
      `event ${input.event}: outcome ${input.outcome} needs a reason`,
    );
  }
  const path = eventsPath(options.env);
  const line: EventLine = {
    ts: (options.now ?? new Date()).toISOString(),
    pid: process.pid,
    ...input,
  };
  try {
    mkdirSync(prismHomeDir(options.env), { recursive: true, mode: 0o700 });
    rotate(path, options.maxBytes ?? EVENTS_MAX_BYTES);
    appendFileSync(path, `${JSON.stringify(line)}\n`, { mode: 0o600 });
    return { written: true };
  } catch (error) {
    return {
      written: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
