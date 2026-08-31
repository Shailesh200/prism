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
 * of the whole file.
 */

import { appendFile, mkdir, rename, stat } from "node:fs/promises";
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

export const RunLogEntrySchema = z.object({
  ts: z.string(),
  phase: RunPhaseSchema,
  text: z.string().default(""),
  tool: z.string().optional(),
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
  const raw = await readTextFile(runLogPath(workspaceRoot, jobId), "");
  const all: RunLogEntry[] = [];
  for (const line of raw.split("\n")) {
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
