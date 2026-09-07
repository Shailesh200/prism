/**
 * Token usage from Cursor SDK and Claude Code stream-json events.
 *
 * Workers patch this onto the run sidecar as events arrive. The Console
 * copies it onto the job so Focus can tick live counts while a teammate
 * is running, then keep the totals after it stops.
 *
 * Two shapes land here:
 * - **turn** — one API call or Cursor stream `usage` event. Billed
 *   input/output are added. Context occupancy is the prompt side of
 *   that call (input + cache).
 * - **cumulative** — Claude `result.usage` / Cursor `run.usage`. Billed
 *   totals replace; occupancy and window from earlier turns are kept
 *   unless the new snapshot names them.
 */

import { type TokenUsage } from "./types.js";

export type { TokenUsage };

export type UsageSource = "cumulative" | "turn";

export type ParsedUsage = {
  readonly usage: TokenUsage;
  readonly source: UsageSource;
};

const INPUT_KEYS = ["inputTokens", "input_tokens"] as const;
const OUTPUT_KEYS = ["outputTokens", "output_tokens"] as const;
const CACHE_READ_KEYS = [
  "cacheReadTokens",
  "cache_read_input_tokens",
  "cacheReadInputTokens",
] as const;
const CACHE_WRITE_KEYS = [
  "cacheWriteTokens",
  "cache_creation_input_tokens",
  "cacheCreationInputTokens",
  "cache_write_tokens",
] as const;
const TOTAL_KEYS = ["totalTokens", "total_tokens"] as const;
const CONTEXT_KEYS = ["contextTokens", "context_tokens"] as const;
const WINDOW_KEYS = ["contextWindow", "context_window"] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readCount(
  row: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
  }
  return undefined;
}

function optionalCount(value: number | undefined): number | undefined {
  return value != null && value > 0 ? value : undefined;
}

export function canonicalTokenUsage(usage: TokenUsage): TokenUsage {
  const totalTokens =
    usage.totalTokens ?? usage.inputTokens + usage.outputTokens;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.cacheReadTokens != null
      ? { cacheReadTokens: usage.cacheReadTokens }
      : {}),
    ...(usage.cacheWriteTokens != null
      ? { cacheWriteTokens: usage.cacheWriteTokens }
      : {}),
    ...(totalTokens > 0 ? { totalTokens } : {}),
    ...(usage.contextTokens != null
      ? { contextTokens: usage.contextTokens }
      : {}),
    ...(usage.contextWindow != null
      ? { contextWindow: usage.contextWindow }
      : {}),
  };
}

function usageFromBag(
  row: Record<string, unknown>,
  occupancy: boolean,
): TokenUsage | undefined {
  const input = readCount(row, INPUT_KEYS);
  const output = readCount(row, OUTPUT_KEYS);
  const cacheRead = readCount(row, CACHE_READ_KEYS);
  const cacheWrite = readCount(row, CACHE_WRITE_KEYS);
  const total = readCount(row, TOTAL_KEYS);
  const window = readCount(row, WINDOW_KEYS);
  const explicitContext = readCount(row, CONTEXT_KEYS);
  if (
    input == null &&
    output == null &&
    cacheRead == null &&
    cacheWrite == null &&
    total == null &&
    explicitContext == null &&
    window == null
  ) {
    return undefined;
  }
  const inputTokens = input ?? 0;
  const outputTokens = output ?? 0;
  const occupancyTokens =
    explicitContext ??
    (occupancy
      ? inputTokens + (cacheRead ?? 0) + (cacheWrite ?? 0)
      : undefined);
  return canonicalTokenUsage({
    inputTokens,
    outputTokens,
    ...(cacheRead != null ? { cacheReadTokens: cacheRead } : {}),
    ...(cacheWrite != null ? { cacheWriteTokens: cacheWrite } : {}),
    ...(total != null ? { totalTokens: total } : {}),
    ...(optionalCount(occupancyTokens) != null
      ? { contextTokens: occupancyTokens }
      : {}),
    ...(optionalCount(window) != null ? { contextWindow: window } : {}),
  });
}

function usageFromModelUsage(value: unknown): TokenUsage | undefined {
  const row = asRecord(value);
  if (!row) return undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let totalTokens = 0;
  let contextWindow: number | undefined;
  let saw = false;
  for (const item of Object.values(row)) {
    const bag = asRecord(item);
    if (!bag) continue;
    const next = usageFromBag(bag, false);
    if (!next) continue;
    saw = true;
    inputTokens += next.inputTokens;
    outputTokens += next.outputTokens;
    cacheReadTokens += next.cacheReadTokens ?? 0;
    cacheWriteTokens += next.cacheWriteTokens ?? 0;
    totalTokens += next.totalTokens ?? next.inputTokens + next.outputTokens;
    if (next.contextWindow) {
      contextWindow = Math.max(contextWindow ?? 0, next.contextWindow);
    }
  }
  if (!saw) return undefined;
  return canonicalTokenUsage({
    inputTokens,
    outputTokens,
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens > 0 ? { cacheWriteTokens } : {}),
    ...(totalTokens > 0 ? { totalTokens } : {}),
    ...(contextWindow ? { contextWindow } : {}),
  });
}

export function parseTokenUsage(value: unknown): ParsedUsage | undefined {
  const row = asRecord(value);
  if (!row) return undefined;
  if (row.type === "stream_event" && row.event) {
    return parseTokenUsage(row.event);
  }
  const type = typeof row.type === "string" ? row.type : undefined;

  if (type === "assistant") {
    const message = asRecord(row.message);
    const bag = asRecord(message?.usage);
    const usage = bag ? usageFromBag(bag, true) : undefined;
    return usage ? { usage, source: "turn" } : undefined;
  }

  if (type === "result") {
    const fromUsage = asRecord(row.usage)
      ? usageFromBag(row.usage as Record<string, unknown>, false)
      : undefined;
    const fromModels = usageFromModelUsage(row.modelUsage);
    if (!fromUsage && !fromModels) return undefined;
    const usage = canonicalTokenUsage({
      inputTokens: fromUsage?.inputTokens ?? fromModels?.inputTokens ?? 0,
      outputTokens: fromUsage?.outputTokens ?? fromModels?.outputTokens ?? 0,
      ...(fromUsage?.cacheReadTokens != null ||
      fromModels?.cacheReadTokens != null
        ? {
            cacheReadTokens:
              fromUsage?.cacheReadTokens ?? fromModels?.cacheReadTokens,
          }
        : {}),
      ...(fromUsage?.cacheWriteTokens != null ||
      fromModels?.cacheWriteTokens != null
        ? {
            cacheWriteTokens:
              fromUsage?.cacheWriteTokens ?? fromModels?.cacheWriteTokens,
          }
        : {}),
      ...(fromUsage?.totalTokens != null || fromModels?.totalTokens != null
        ? {
            totalTokens: fromUsage?.totalTokens ?? fromModels?.totalTokens,
          }
        : {}),
      ...(fromUsage?.contextTokens != null
        ? { contextTokens: fromUsage.contextTokens }
        : {}),
      ...(fromModels?.contextWindow != null || fromUsage?.contextWindow != null
        ? {
            contextWindow:
              fromModels?.contextWindow ?? fromUsage?.contextWindow,
          }
        : {}),
    });
    return { usage, source: "cumulative" };
  }

  if (type === "usage") {
    const nested = asRecord(row.usage);
    const usage = nested ? usageFromBag(nested, true) : usageFromBag(row, true);
    return usage ? { usage, source: "turn" } : undefined;
  }

  const nested = asRecord(row.usage);
  if (nested) {
    const usage = usageFromBag(nested, false);
    if (usage) return { usage, source: "cumulative" };
  }

  if (
    readCount(row, INPUT_KEYS) != null ||
    readCount(row, OUTPUT_KEYS) != null ||
    readCount(row, TOTAL_KEYS) != null
  ) {
    const usage = usageFromBag(row, false);
    return usage ? { usage, source: "cumulative" } : undefined;
  }
  return undefined;
}

export function mergeTokenUsage(
  prev: TokenUsage | undefined,
  parsed: ParsedUsage,
): TokenUsage {
  const next = parsed.usage;
  if (parsed.source === "cumulative") {
    const billed =
      next.inputTokens > 0 ||
      next.outputTokens > 0 ||
      (next.totalTokens ?? 0) > 0 ||
      !prev
        ? next
        : prev;
    return canonicalTokenUsage({
      inputTokens: billed.inputTokens,
      outputTokens: billed.outputTokens,
      ...(billed.cacheReadTokens != null
        ? { cacheReadTokens: billed.cacheReadTokens }
        : prev?.cacheReadTokens != null
          ? { cacheReadTokens: prev.cacheReadTokens }
          : {}),
      ...(billed.cacheWriteTokens != null
        ? { cacheWriteTokens: billed.cacheWriteTokens }
        : prev?.cacheWriteTokens != null
          ? { cacheWriteTokens: prev.cacheWriteTokens }
          : {}),
      ...(billed.totalTokens != null
        ? { totalTokens: billed.totalTokens }
        : {}),
      contextTokens: next.contextTokens ?? prev?.contextTokens,
      contextWindow: next.contextWindow ?? prev?.contextWindow,
    });
  }
  const inputTokens = (prev?.inputTokens ?? 0) + next.inputTokens;
  const outputTokens = (prev?.outputTokens ?? 0) + next.outputTokens;
  const cacheReadTokens =
    (prev?.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0);
  const cacheWriteTokens =
    (prev?.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0);
  return canonicalTokenUsage({
    inputTokens,
    outputTokens,
    ...(cacheReadTokens > 0 || prev?.cacheReadTokens != null
      ? { cacheReadTokens }
      : {}),
    ...(cacheWriteTokens > 0 || prev?.cacheWriteTokens != null
      ? { cacheWriteTokens }
      : {}),
    totalTokens:
      (prev?.totalTokens ?? (prev ? prev.inputTokens + prev.outputTokens : 0)) +
      (next.totalTokens ?? next.inputTokens + next.outputTokens),
    contextTokens: next.contextTokens ?? prev?.contextTokens,
    contextWindow: next.contextWindow ?? prev?.contextWindow,
  });
}

export function applyParsedUsage(
  prev: TokenUsage | undefined,
  value: unknown,
): TokenUsage | undefined {
  const parsed = parseTokenUsage(value);
  if (!parsed) return prev;
  return mergeTokenUsage(prev, parsed);
}

export function tokenUsageEqual(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
