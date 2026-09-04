/**
 * Claude Code `stream-json` events → Dispatch console entries (ADR-0044 §4).
 *
 * `claude -p --output-format stream-json --verbose` emits one JSON object per
 * line: `system/init`, `assistant` (content blocks: thinking / text /
 * tool_use), `user` (tool_result blocks), and a terminal `result`. These
 * parsers are defensive pure functions — unknown shapes yield undefined
 * rather than throwing, mirroring event-text.ts for the Cursor SDK.
 */

import { clip } from "./event-text.js";
import { MAX_ENTRY_TEXT, type RunLogEntry } from "./run-log.js";
import type { RunPhase } from "./run-state.js";

/** Tools that mean "files are changing", for the activity line. */
const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

function blocks(event: Record<string, unknown>): Record<string, unknown>[] {
  const message = event.message;
  if (!message || typeof message !== "object") return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (block): block is Record<string, unknown> =>
      Boolean(block) && typeof block === "object",
  );
}

function blockText(block: Record<string, unknown>): string {
  if (typeof block.text === "string") return block.text;
  if (typeof block.thinking === "string") return block.thinking;
  return "";
}

/** Short target for a tool call: the file, pattern, or query it acts on. */
function toolTarget(block: Record<string, unknown>): string {
  const input = block.input;
  if (!input || typeof input !== "object") return "";
  const row = input as Record<string, unknown>;
  for (const key of [
    "file_path",
    "pattern",
    "query",
    "description",
    "prompt",
    "command",
    "path",
  ]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toolName(block: Record<string, unknown>): string {
  return typeof block.name === "string" ? block.name : "";
}

/** Session handle from `system/init` (or the terminal `result`). */
export function claudeSessionIdFrom(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const row = event as Record<string, unknown>;
  if (typeof row.session_id !== "string" || !row.session_id) return undefined;
  if (row.type === "system" || row.type === "result") return row.session_id;
  return undefined;
}

/** Model id from `system/init`, an assistant message, or `result.modelUsage`. */
export function claudeModelFrom(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const row = event as Record<string, unknown>;
  if (typeof row.model === "string" && row.model.trim())
    return row.model.trim();
  const message = row.message;
  if (message && typeof message === "object") {
    const model = (message as Record<string, unknown>).model;
    if (typeof model === "string" && model.trim()) return model.trim();
  }
  const usage = row.modelUsage;
  if (usage && typeof usage === "object" && !Array.isArray(usage)) {
    const first = Object.keys(usage)[0];
    if (first?.trim()) return first.trim();
  }
  return undefined;
}

function thinkingValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value));
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (
      typeof row.budget_tokens === "number" &&
      Number.isFinite(row.budget_tokens)
    ) {
      return String(Math.round(row.budget_tokens));
    }
    if (typeof row.type === "string" && row.type.trim()) return row.type.trim();
  }
  return undefined;
}

/**
 * Thinking / effort from init, a result, or a thinking content block.
 *
 * Native Claude Code reports this as `thinking` (enabled / adaptive / a
 * budget) or `effort`. A thinking content block only tells us it was on.
 */
export function claudeThinkingFrom(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const row = event as Record<string, unknown>;
  const direct =
    thinkingValue(row.thinking) ??
    thinkingValue(row.effort) ??
    thinkingValue(row.thinkingBudget);
  if (direct) return direct;
  for (const block of blocks(row)) {
    if (block.type === "thinking") return "thinking";
  }
  return undefined;
}

/**
 * Subagent grouping key (M-066 P-P6): stream-json sets
 * `parent_tool_use_id` on events inside a Task subagent. The primary agent's
 * events have it null.
 */
export function claudeParentFrom(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const row = event as Record<string, unknown>;
  const parent = row.parent_tool_use_id;
  return typeof parent === "string" && parent ? parent : undefined;
}

export type ClaudeResult = {
  readonly text: string;
  readonly isError: boolean;
  readonly subtype: string;
};

/** The terminal `result` event, or undefined for anything else. */
export function claudeResultFrom(event: unknown): ClaudeResult | undefined {
  if (!event || typeof event !== "object") return undefined;
  const row = event as Record<string, unknown>;
  if (row.type !== "result") return undefined;
  return {
    text: typeof row.result === "string" ? row.result : "",
    isError: row.is_error === true,
    subtype: typeof row.subtype === "string" ? row.subtype : "",
  };
}

/** Console lines for one stream event (one per content block). */
export function claudeLogEntriesFrom(
  event: unknown,
  now: Date = new Date(),
): RunLogEntry[] {
  if (!event || typeof event !== "object") return [];
  const row = event as Record<string, unknown>;
  if (row.type === "stream_event" && row.event) {
    return claudeLogEntriesFrom(row.event, now);
  }
  const ts = now.toISOString();
  const parent = claudeParentFrom(event);
  const sub = parent ? { parent } : {};

  if (row.type === "system" && row.subtype === "init") {
    return [{ ts, phase: "running", text: "Teammate is on it", level: "info" }];
  }

  if (row.type === "assistant") {
    const entries: RunLogEntry[] = [];
    for (const block of blocks(row)) {
      if (block.type === "thinking" || block.type === "text") {
        const text = clip(blockText(block), MAX_ENTRY_TEXT);
        if (text) {
          entries.push({ ts, phase: "thinking", text, level: "info", ...sub });
        }
      }
      if (block.type === "tool_use") {
        const name = toolName(block);
        const target = clip(toolTarget(block), 200);
        const label =
          name === "Task" && target
            ? `Subagent: ${target}`
            : target
              ? `Using ${name} on ${target}`
              : `Using ${name}`;
        const editing = EDIT_TOOLS.has(name);
        entries.push({
          ts,
          phase: editing ? "editing" : "tool",
          text: label,
          level: "info",
          ...(name ? { tool: name } : {}),
          ...sub,
        });
      }
    }
    return entries;
  }

  // Streaming deltas are one token at a time. Logging them produced a
  // console that said "Prism" and nothing else; the complete `assistant`
  // event already carries the full thought.
  if (row.type === "content_block_delta") {
    return [];
  }

  if (row.type === "user") {
    for (const block of blocks(row)) {
      if (block.type === "tool_result" && block.is_error === true) {
        const content = block.content;
        const text = clip(
          typeof content === "string" ? content : "Tool call failed",
          MAX_ENTRY_TEXT,
        );
        return [
          {
            ts,
            phase: "tool",
            text: text || "Tool call failed",
            level: "error",
            ...sub,
          },
        ];
      }
    }
    return [];
  }

  if (
    row.type === "result" &&
    typeof row.result === "string" &&
    row.result.trim()
  ) {
    return [
      {
        ts,
        phase: "thinking",
        text: clip(row.result, MAX_ENTRY_TEXT),
        level: "info",
        ...sub,
      },
    ];
  }

  return [];
}

/** Console line for one stream event; undefined when nothing is worth keeping. */
export function claudeLogEntryFrom(
  event: unknown,
  now: Date = new Date(),
): RunLogEntry | undefined {
  return claudeLogEntriesFrom(event, now)[0];
}

/** One-line activity for the run-state sidecar; undefined when unchanged. */
export function claudeActivityFrom(
  event: unknown,
): { phase: RunPhase; lastActivity: string } | undefined {
  if (!event || typeof event !== "object") return undefined;
  const row = event as Record<string, unknown>;

  if (row.type === "system" && row.subtype === "init") {
    return { phase: "running", lastActivity: "Teammate is on it" };
  }

  if (row.type === "assistant") {
    for (const block of blocks(row)) {
      if (block.type === "tool_use") {
        const name = toolName(block);
        if (EDIT_TOOLS.has(name)) {
          return { phase: "editing", lastActivity: "Editing files" };
        }
        return {
          phase: "tool",
          lastActivity: name ? `Using ${name}` : "Using a tool",
        };
      }
    }
    for (const block of blocks(row)) {
      if (block.type === "thinking" || block.type === "text") {
        const text = clip(blockText(block), 140);
        return text
          ? { phase: "thinking", lastActivity: text }
          : { phase: "thinking", lastActivity: "Thinking" };
      }
    }
  }

  return undefined;
}
