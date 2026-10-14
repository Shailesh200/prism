/**
 * Envelope v2 (M-094, ADR-0066): per-tool token budgets and one honest line
 * per session.
 *
 * Tokens are response bytes ÷ 4, the same rule Prepare's budget uses. Only
 * sizes, counts and tool names are read; the ledger never holds a response
 * body, a prompt or file contents.
 */

import type { EnvelopeLedgerEntry } from "./envelope-ledger.js";

/** The budget each tool's answer should fit. A call over it is flagged. */
export const TOOL_TOKEN_BUDGETS: Readonly<Record<string, number>> = {
  prepare_change: 2000,
  blast_radius: 2000,
  guard_session: 2000,
  test_impact: 1500,
  repository_overview: 1500,
  find_symbol: 1000,
  explain_area: 1500,
  graph: 1500,
};
export const DEFAULT_TOOL_TOKEN_BUDGET = 3000;

export function tokensOf(
  entry: Pick<EnvelopeLedgerEntry, "jsonBytes">,
): number {
  return Math.ceil(entry.jsonBytes / 4);
}

export function budgetFor(tool: string): number {
  return TOOL_TOKEN_BUDGETS[tool] ?? DEFAULT_TOOL_TOKEN_BUDGET;
}

export function isOverBudget(entry: EnvelopeLedgerEntry): boolean {
  return tokensOf(entry) > budgetFor(entry.tool);
}

export type EnvelopeToolRow = {
  readonly tool: string;
  readonly calls: number;
  readonly tokens: number;
  readonly p95Tokens: number;
  readonly budget: number;
  readonly overBudget: number;
};

export type EnvelopeReport = {
  readonly calls: number;
  readonly tokens: number;
  readonly fromHooks: number;
  readonly overBudget: number;
  readonly sessions: number;
  readonly byTool: readonly EnvelopeToolRow[];
  readonly worst: readonly {
    readonly ts: string;
    readonly tool: string;
    readonly tokens: number;
    readonly budget: number;
  }[];
  /** Null until M-098 measures a baseline; never guessed. */
  readonly estimatedSaved: number | null;
};

function p95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  ]!;
}

export function envelopeReport(
  entries: readonly EnvelopeLedgerEntry[],
  options: { readonly since?: number } = {},
): EnvelopeReport {
  const rows = entries.filter(
    (e) => options.since === undefined || Date.parse(e.ts) >= options.since,
  );
  const byTool = new Map<string, EnvelopeLedgerEntry[]>();
  for (const row of rows) {
    byTool.set(row.tool, [...(byTool.get(row.tool) ?? []), row]);
  }
  const tools: EnvelopeToolRow[] = [...byTool.entries()]
    .map(([tool, list]) => ({
      tool,
      calls: list.length,
      tokens: list.reduce((sum, e) => sum + tokensOf(e), 0),
      p95Tokens: p95(list.map(tokensOf)),
      budget: budgetFor(tool),
      overBudget: list.filter(isOverBudget).length,
    }))
    .sort((a, b) => b.tokens - a.tokens);
  const worst = rows
    .filter(isOverBudget)
    .map((e) => ({
      ts: e.ts,
      tool: e.tool,
      tokens: tokensOf(e),
      budget: budgetFor(e.tool),
    }))
    .sort((a, b) => b.tokens - b.budget - (a.tokens - a.budget))
    .slice(0, 5);
  return {
    calls: rows.length,
    tokens: rows.reduce((sum, e) => sum + tokensOf(e), 0),
    fromHooks: rows.filter((e) => e.source === "hook").length,
    overBudget: rows.filter(isOverBudget).length,
    sessions: new Set(rows.map((e) => e.sessionId).filter(Boolean)).size,
    byTool: tools,
    worst,
    estimatedSaved: null,
  };
}

function compact(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

/** The receipt footer: `Envelope  7 calls · 9.1k tokens in · est. saved — · 0 over budget`. */
export function envelopeFooter(report: EnvelopeReport): string | null {
  if (report.calls === 0) return null;
  const saved =
    report.estimatedSaved === null
      ? "est. saved — (not calibrated yet)"
      : `est. ${compact(report.estimatedSaved)} saved`;
  return `${report.calls} ${report.calls === 1 ? "call" : "calls"} · ${compact(report.tokens)} tokens in · ${saved} · ${report.overBudget} over budget`;
}
