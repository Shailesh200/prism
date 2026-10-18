/**
 * Per-tool token budgets, enforced (plan P3).
 *
 * Every tool answer is an object whose arrays are already in rank order
 * (best first). `fitToBudget` drops items from the tail of the largest
 * arrays until the JSON fits `maxTokens`, and says what it cut and how to get
 * it back (`offset`). Scalars and short arrays are never touched, so an
 * answer's shape stays the same. Paging with `offset` skips that many items
 * in each array that was cut, so every item is returned exactly once.
 */

import { estimateJsonTokens } from "./tokens.js";

export type BudgetCut = {
  readonly maxTokens: number;
  /** field path → items left out of that array. */
  readonly cut: Readonly<Record<string, number>>;
  readonly offset: number;
  readonly hint: string;
};

/** Default budgets per tool; a call may lower or raise them up to the ceiling. */
export const TOOL_TOKEN_BUDGETS: Readonly<Record<string, number>> = {
  prepare_change: 2000,
  blast_radius: 2000,
  guard_session: 2000,
  test_impact: 1500,
  repository_overview: 1500,
  graph: 1500,
  safe_delete: 1500,
  rename_impact: 1500,
  habits: 600,
};
export const DEFAULT_TOOL_TOKEN_BUDGET = 3000;
export const TOOL_TOKEN_CEILING = 12_000;
export const TOOL_TOKEN_FLOOR = 200;

export function budgetFor(tool: string, requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return TOOL_TOKEN_BUDGETS[tool] ?? DEFAULT_TOOL_TOKEN_BUDGET;
  }
  return Math.max(
    TOOL_TOKEN_FLOOR,
    Math.min(TOOL_TOKEN_CEILING, Math.round(requested)),
  );
}

type ArrayRef = { path: string; holder: Record<string, unknown>; key: string };

function arraysOf(
  value: unknown,
  path = "",
  out: ArrayRef[] = [],
  depth = 0,
): ArrayRef[] {
  if (
    depth > 3 ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (Array.isArray(child)) {
      out.push({
        path: childPath,
        holder: value as Record<string, unknown>,
        key,
      });
    } else {
      arraysOf(child, childPath, out, depth + 1);
    }
  }
  return out;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

/** Skip `offset` items in every array (used when paging past a cut). */
function applyOffset(value: unknown, offset: number): void {
  if (offset <= 0) return;
  for (const ref of arraysOf(value)) {
    const items = ref.holder[ref.key] as unknown[];
    if (items.length > 0) ref.holder[ref.key] = items.slice(offset);
  }
}

export function fitToBudget<T>(
  value: T,
  maxTokens: number,
  offset = 0,
): { readonly value: T; readonly budget?: BudgetCut } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value };
  }
  if (offset <= 0 && estimateJsonTokens(value) <= maxTokens) return { value };
  const copy = cloneJson(value);
  applyOffset(copy, offset);
  const cut: Record<string, number> = {};
  const withFooter = (): unknown => ({
    ...(copy as object),
    budget: { maxTokens, cut, offset, hint: "" },
  });
  while (estimateJsonTokens(withFooter()) > maxTokens) {
    // Cut from the array that currently costs the most, one tail item at a time.
    let worst: ArrayRef | undefined;
    let worstCost = 0;
    for (const ref of arraysOf(copy)) {
      const items = ref.holder[ref.key] as unknown[];
      if (items.length <= 1) continue;
      const cost = estimateJsonTokens(items);
      if (cost > worstCost) {
        worst = ref;
        worstCost = cost;
      }
    }
    if (!worst) break;
    const items = worst.holder[worst.key] as unknown[];
    const drop = Math.max(1, Math.ceil(items.length * 0.1));
    worst.holder[worst.key] = items.slice(0, items.length - drop);
    cut[worst.path] = (cut[worst.path] ?? 0) + drop;
  }
  const total = Object.values(cut).reduce((a, b) => a + b, 0);
  if (total === 0 && offset <= 0) return { value: copy };
  const kept = Math.min(
    ...Object.keys(cut).map((path) => {
      const ref = arraysOf(copy).find((r) => r.path === path);
      return ref ? (ref.holder[ref.key] as unknown[]).length : 0;
    }),
    Number.MAX_SAFE_INTEGER,
  );
  const next = offset + (Number.isFinite(kept) ? kept : 0);
  const budget: BudgetCut = {
    maxTokens,
    cut,
    offset,
    hint:
      total > 0
        ? `truncated: ${total} more (ask again with offset: ${next}, or a larger maxTokens)`
        : "",
  };
  return { value: { ...(copy as object), budget } as T, budget };
}
