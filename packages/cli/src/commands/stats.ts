/**
 * `prism stats [--since 1d]` (plan §8, COV-73): p50/p95 per hook and tool,
 * outcome counts and the top reasons, read from `events.jsonl` and its
 * rotated generations. These are the T2–T5 and T10 numbers.
 */
import { existsSync, readFileSync } from "node:fs";
import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import {
  EVENTS_GENERATIONS,
  eventsPath,
  type EventLine,
} from "@repo-prism/shared/events";
import type { CommandHandler } from "../runtime.js";

const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** `30m`, `6h`, `1d`, `2w` → milliseconds; undefined when malformed. */
export function parseSince(text: string): number | undefined {
  const match = /^(\d+)([mhdw])$/.exec(text.trim());
  if (!match) return undefined;
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

export type EventStats = {
  readonly event: string;
  readonly count: number;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly topReasons: readonly { reason: string; count: number }[];
};

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? null;
}

export function readEventLines(env: NodeJS.ProcessEnv): {
  lines: EventLine[];
  unreadable: number;
} {
  const base = eventsPath(env);
  const lines: EventLine[] = [];
  let unreadable = 0;
  for (let n = EVENTS_GENERATIONS - 1; n >= 0; n -= 1) {
    const path = n === 0 ? base : `${base}.${n}`;
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      if (!raw.trim()) continue;
      try {
        lines.push(JSON.parse(raw) as EventLine);
      } catch (error) {
        // A torn last line from a crashed writer: counted, never hidden.
        if (!(error instanceof SyntaxError)) throw error;
        unreadable += 1;
      }
    }
  }
  return { lines, unreadable };
}

export function summarizeEvents(
  lines: readonly EventLine[],
  sinceMs?: number,
  now = Date.now(),
): EventStats[] {
  const groups = new Map<string, EventLine[]>();
  for (const line of lines) {
    if (sinceMs !== undefined && now - Date.parse(line.ts) > sinceMs) continue;
    const group = groups.get(line.event) ?? [];
    group.push(line);
    groups.set(line.event, group);
  }
  return [...groups]
    .map(([event, rows]) => {
      const outcomes: Record<string, number> = {};
      const reasons = new Map<string, number>();
      const durations: number[] = [];
      for (const row of rows) {
        outcomes[row.outcome] = (outcomes[row.outcome] ?? 0) + 1;
        if (row.reason)
          reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
        if (typeof row.durationMs === "number") durations.push(row.durationMs);
      }
      durations.sort((a, b) => a - b);
      return {
        event,
        count: rows.length,
        outcomes,
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        topReasons: [...reasons]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([reason, count]) => ({ reason, count })),
      };
    })
    .sort((a, b) => a.event.localeCompare(b.event));
}

export const statsCommand: CommandHandler = async (context) => {
  const since = context.args.option("since");
  const sinceMs = since === undefined ? undefined : parseSince(since);
  if (since !== undefined && sinceMs === undefined)
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `--since takes a duration like 30m, 6h, 1d or 2w, not "${since}".`,
      ),
    );
  const { lines, unreadable } = readEventLines(process.env);
  const stats = summarizeEvents(lines, sinceMs);
  return ok({
    data: { since: since ?? null, events: stats, unreadable },
    human: ({ width }) => {
      if (stats.length === 0) return "No events recorded yet.";
      const ms = (value: number | null) =>
        value === null ? "-" : `${value}ms`;
      const rows = stats.map((row) => {
        const outcomes = Object.entries(row.outcomes)
          .map(([outcome, count]) => `${outcome} ${count}`)
          .join(", ");
        const reasons = row.topReasons
          .map((r) => `${r.reason} ×${r.count}`)
          .join(", ");
        return `${row.event.padEnd(28)} n=${String(row.count).padEnd(5)} p50 ${ms(row.p50Ms).padEnd(8)} p95 ${ms(row.p95Ms).padEnd(8)} ${outcomes}${reasons ? `; ${reasons}` : ""}`;
      });
      if (unreadable > 0)
        rows.push(`${unreadable} unreadable line(s) skipped.`);
      return rows
        .map((line) =>
          line.length > width ? `${line.slice(0, width - 1)}…` : line,
        )
        .join("\n");
    },
  });
};
