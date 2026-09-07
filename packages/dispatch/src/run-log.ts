/**
 * Append-only console log for one Dispatch job.
 *
 * `run.json` holds a single `lastActivity` line that every event overwrites,
 * which is why a job could sit on "Thinking" for an hour with nothing to
 * inspect. This is the history behind that line: one JSON object per line,
 * written unthrottled by the worker child and tailed by chat (`job_logs`) and
 * the Jobs console.
 *
 * JSONL rather than a growing JSON array so an append is one `appendFile` and
 * a truncated tail (worker killed mid-write) costs one unparsable line instead
 * of the whole file. Consecutive thinking events extend the last line so the
 * console shows one thought, then the next line when a tool runs.
 */

import { appendFile, mkdir, open, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import {
  clip,
  eventType,
  textFromUnknown,
  toolNameFrom,
} from "./event-text.js";
import { readTextFile } from "./json-file.js";
import { runLogPath, rotatedRunLogPath } from "./paths.js";
import { RunPhaseSchema } from "./run-state.js";

/** Per-entry text cap. Long model output is for the transcript, not this log. */
export const MAX_ENTRY_TEXT = 2_000;

/** Rotate at 4 MB, keep one previous file: bounded at ~8 MB per job. */
export const MAX_LOG_BYTES = 4_000_000;

/** Bytes of tail to inspect when extending the open thinking line. */
const TAIL_WINDOW = 16_384;

export const RunLogEntrySchema = z.object({
  ts: z.string(),
  phase: RunPhaseSchema,
  text: z.string().default(""),
  tool: z.string().optional(),
  /**
   * Subagent grouping (M-066 P-P6): the Task tool_use id this line belongs
   * to. Absent = the primary agent.
   */
  parent: z.string().optional(),
  level: z.enum(["info", "error"]).default("info"),
});
export type RunLogEntry = z.infer<typeof RunLogEntrySchema>;

export function formatRunLogLine(entry: RunLogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export function parseRunLogLine(line: string): RunLogEntry | undefined {
  const text = line.trim();
  if (!text) return undefined;
  try {
    const parsed = RunLogEntrySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    // A half-written final line is expected when a worker is killed.
    return undefined;
  }
}

/**
 * Glue a streaming thinking chunk onto the open thought.
 *
 * Cursor (and similar) emit a few words per event. Cumulative buffers
 * (`"The cat"` then `"The cat sat"`) replace; deltas append with a space.
 */
export function joinThinkingText(prev: string, next: string): string {
  const a = prev.replace(/\s+/g, " ").trim();
  const b = next.replace(/\s+/g, " ").trim();
  if (!a || /^thinking\.?$/i.test(a)) return b || a;
  if (!b || /^thinking\.?$/i.test(b)) return a;
  if (b.startsWith(a)) return b;
  if (a.startsWith(b) || a.endsWith(b)) return a;
  return `${a} ${b}`;
}

type ThinkingBlockEntry = {
  readonly phase: string;
  readonly text: string;
  readonly parent?: string | undefined;
  readonly level?: string | undefined;
  readonly tool?: string | undefined;
};

function isModelSpeech(entry: ThinkingBlockEntry): boolean {
  if (entry.tool) return false;
  if (entry.phase === "thinking") return true;
  if (entry.phase !== "running") return false;
  const text = entry.text.trim();
  if (!text) return false;
  return !/^(Teammate |Done —)/i.test(text);
}

export function thinkingBlockContinues(
  last: ThinkingBlockEntry,
  next: ThinkingBlockEntry,
): boolean {
  return (
    isModelSpeech(last) &&
    isModelSpeech(next) &&
    (last.level ?? "info") === (next.level ?? "info") &&
    (last.parent ?? "") === (next.parent ?? "")
  );
}

/** Fold consecutive thinking lines until a tool (or any other phase) breaks the block. */
export function coalesceThinkingEntries<T extends ThinkingBlockEntry>(
  entries: readonly T[],
): T[] {
  const out: T[] = [];
  for (const entry of entries) {
    const prev = out.at(-1);
    if (prev && thinkingBlockContinues(prev, entry)) {
      const text = joinThinkingText(prev.text, entry.text);
      if (text === prev.text) continue;
      const phase =
        prev.phase === "thinking" || entry.phase === "thinking"
          ? "thinking"
          : prev.phase;
      out[out.length - 1] = { ...prev, text, phase };
      continue;
    }
    out.push(entry);
  }
  return out;
}

async function readLogTail(
  path: string,
): Promise<{ lastLine: string; lastStart: number } | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, "r");
    const { size } = await handle.stat();
    if (size === 0) return undefined;
    const window = Math.min(size, TAIL_WINDOW);
    const buf = Buffer.alloc(window);
    await handle.read(buf, 0, window, size - window);
    const chunk = buf.toString("utf8");
    let end = chunk.length;
    if (chunk.endsWith("\n")) end -= 1;
    const nl = chunk.lastIndexOf("\n", Math.max(end - 1, 0));
    const lineStartInChunk = nl === -1 ? 0 : nl + 1;
    return {
      lastLine: chunk.slice(lineStartInChunk, end),
      lastStart: size - window + lineStartInChunk,
    };
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

/** Rewrite the last JSONL line when it is still the same thinking block. */
async function extendLastThinking(
  path: string,
  entry: RunLogEntry,
): Promise<boolean> {
  if (!isModelSpeech(entry)) return false;
  const tail = await readLogTail(path);
  if (!tail?.lastLine) return false;
  const last = parseRunLogLine(tail.lastLine);
  if (!last || !thinkingBlockContinues(last, entry)) return false;
  const joined = joinThinkingText(last.text, entry.text);
  const text = clip(joined, MAX_ENTRY_TEXT);
  if (text === last.text) {
    // Cap hit with more text still coming — start a fresh line so we keep it.
    return joined.length <= last.text.length;
  }
  const next: RunLogEntry = { ...last, text, ts: entry.ts };
  const handle = await open(path, "r+");
  try {
    await handle.truncate(tail.lastStart);
    await handle.write(formatRunLogLine(next), tail.lastStart);
  } finally {
    await handle.close();
  }
  return true;
}

async function rotateIfLarge(path: string): Promise<void> {
  try {
    const info = await stat(path);
    if (info.size < MAX_LOG_BYTES) return;
    await rename(path, rotatedRunLogPath(path));
  } catch {
    // No file yet, or rotation lost a race — either way the append proceeds.
  }
}

export async function appendRunLog(
  workspaceRoot: string,
  jobId: string,
  entry: RunLogEntry,
): Promise<void> {
  const path = runLogPath(workspaceRoot, jobId);
  try {
    await mkdir(dirname(path), { recursive: true });
    await rotateIfLarge(path);
    if (await extendLastThinking(path, entry)) return;
    await appendFile(path, formatRunLogLine(entry), "utf8");
  } catch {
    // Logging must never take the job down.
  }
}

export type ReadRunLogOptions = {
  /** Most recent N entries. Defaults to 200. */
  readonly limit?: number;
  /** Drop entries at or before this ISO timestamp (for follow/tail). */
  readonly since?: string;
};

export type RunLogPage = {
  readonly entries: RunLogEntry[];
  readonly totalCount: number;
  readonly truncated: boolean;
};

export async function readRunLog(
  workspaceRoot: string,
  jobId: string,
  options: ReadRunLogOptions = {},
): Promise<RunLogPage> {
  const limit = Math.max(1, Math.min(options.limit ?? 200, 2_000));
  const path = runLogPath(workspaceRoot, jobId);
  // Rotation moves history to `.1`, so reading only the live file silently
  // dropped everything before the last roll — the exact window you want when a
  // long job went wrong. Oldest first.
  const [rotated, current] = await Promise.all([
    readTextFile(rotatedRunLogPath(path), ""),
    readTextFile(path, ""),
  ]);
  const all: RunLogEntry[] = [];
  for (const line of `${rotated}\n${current}`.split("\n")) {
    const entry = parseRunLogLine(line);
    if (entry) all.push(entry);
  }

  const sinceMs = options.since ? Date.parse(options.since) : Number.NaN;
  const filtered = Number.isFinite(sinceMs)
    ? all.filter((entry) => {
        const ts = Date.parse(entry.ts);
        return !Number.isFinite(ts) || ts > sinceMs;
      })
    : all;

  return {
    entries: filtered.slice(-limit),
    totalCount: filtered.length,
    truncated: filtered.length > limit,
  };
}

/**
 * Full-fidelity log entry for a stream event.
 *
 * Deliberately wider than `activityFromEvent`: that one answers "what is it
 * doing right now" in 140 characters, this one is the record you read when a
 * job went wrong, so unknown event types are kept rather than dropped.
 */
export function logEntryFromEvent(
  event: unknown,
  now: Date = new Date(),
): RunLogEntry | undefined {
  if (!event || typeof event !== "object") return undefined;
  const type = eventType(event);
  const tool = toolNameFrom(event);
  const text = clip(textFromUnknown(event), MAX_ENTRY_TEXT);
  const ts = now.toISOString();

  if (type === "thinking" || type === "reason" || type === "reasoning") {
    return { ts, phase: "thinking", text: text || "Thinking", level: "info" };
  }
  if ((type === "assistant" || type === "delta") && text) {
    return { ts, phase: "thinking", text, level: "info" };
  }
  if (
    type.includes("tool_call") ||
    type === "tool" ||
    type === "function_call"
  ) {
    return {
      ts,
      phase: "tool",
      text: text || (tool ? `Using ${tool}` : "Using a tool"),
      level: "info",
      ...(tool ? { tool } : {}),
    };
  }
  if (type.includes("tool_result") || type === "tool_response") {
    return {
      ts,
      phase: "tool",
      text: text || (tool ? `Finished ${tool}` : "Finished a tool"),
      level: "info",
      ...(tool ? { tool } : {}),
    };
  }
  if (type.includes("edit") || type === "write" || type === "apply") {
    return {
      ts,
      phase: "editing",
      text: text || "Editing files",
      level: "info",
      ...(tool ? { tool } : {}),
    };
  }
  if (type.includes("error")) {
    return { ts, phase: "failed", text: text || "Error", level: "error" };
  }
  if (!text) return undefined;
  return { ts, phase: "running", text, level: "info" };
}

/** Console line for a lifecycle moment the SDK does not emit. */
export function lifecycleLogEntry(
  phase: RunLogEntry["phase"],
  text: string,
  now: Date = new Date(),
): RunLogEntry {
  return {
    ts: now.toISOString(),
    phase,
    text: clip(text, MAX_ENTRY_TEXT),
    level: phase === "failed" ? "error" : "info",
  };
}
