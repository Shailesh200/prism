/**
 * One token budget for the whole Prepare response (M-093, program §5.1).
 *
 * Tokens are response bytes ÷ 4 (`tokens.ts`), the same estimate every tool
 * budget uses. Sections are trimmed from the least to
 * the most useful: house style, notes, work order, reuse, then the pack's
 * own files. Whatever was cut is named in `trimmed`, with how to get it.
 */

import {
  PREPARE_RESPONSE_BUDGET,
  PREPARE_RESPONSE_CEILING,
  PREPARE_TRIM_SECTIONS,
  type PrepareTrimSection,
  type PrepareTrimmed,
} from "./prepare-trimmed.js";
import type { PrepareChange } from "./schemas.js";

export {
  AUTO_PREPARE_BUDGET,
  PREPARE_RESPONSE_BUDGET,
  PREPARE_RESPONSE_CEILING,
  PREPARE_TRIM_SECTIONS,
  PrepareTrimmedSchema,
  type PrepareTrimSection,
  type PrepareTrimmed,
} from "./prepare-trimmed.js";

const encoder = new TextEncoder();

export function prepareResponseTokens(value: unknown): number {
  return Math.ceil(encoder.encode(JSON.stringify(value ?? null)).length / 4);
}

export function clampPrepareBudget(budget: number | undefined): number {
  if (budget === undefined || !Number.isFinite(budget)) {
    return PREPARE_RESPONSE_BUDGET;
  }
  return Math.max(200, Math.min(PREPARE_RESPONSE_CEILING, Math.round(budget)));
}

type Counts = Record<PrepareTrimSection, number>;

function counts(prep: PrepareChange): Counts {
  return {
    conventions: prep.conventions?.length ?? 0,
    notes: prep.notes?.length ?? 0,
    order:
      prep.order.inScope.length +
      prep.order.offLimits.length +
      prep.order.needsSignOff.length,
    reuse: prep.reuse.length,
    tests: prep.pack.tests.length,
    pack: prep.pack.files.length,
  };
}

/**
 * Reserved shares of the budget (plan §5.1): reuse 15%, house style 10%,
 * work order 10%. A reserved section is first trimmed to its share; the file
 * list is then cut before anything that fits its reserve.
 */
export const PREPARE_RESERVES: Readonly<
  Record<"reuse" | "conventions" | "order", number>
> = { reuse: 0.15, conventions: 0.1, order: 0.1 };

/** The pack keeps at least one file; everything else can go to zero. */
const FLOOR: Counts = {
  conventions: 0,
  notes: 0,
  order: 0,
  reuse: 0,
  tests: 0,
  pack: 1,
};

function sectionTokens(
  prep: PrepareChange,
  section: PrepareTrimSection,
): number {
  switch (section) {
    case "conventions":
      return prepareResponseTokens(prep.conventions ?? []);
    case "notes":
      return prepareResponseTokens(prep.notes ?? []);
    case "order":
      return prepareResponseTokens(prep.order);
    case "reuse":
      return prepareResponseTokens(prep.reuse);
    case "tests":
      return prepareResponseTokens(prep.pack.tests);
    case "pack":
      return prepareResponseTokens(prep.pack.files);
  }
}

function shrink(
  prep: PrepareChange,
  section: PrepareTrimSection,
): PrepareChange {
  switch (section) {
    case "conventions":
      return { ...prep, conventions: (prep.conventions ?? []).slice(0, -1) };
    case "notes":
      return { ...prep, notes: (prep.notes ?? []).slice(0, -1) };
    case "order": {
      // In-scope paths repeat the pack; drop those first, then the longest list.
      const o = prep.order;
      if (o.inScope.length > 0) {
        return { ...prep, order: { ...o, inScope: o.inScope.slice(0, -1) } };
      }
      if (o.offLimits.length >= o.needsSignOff.length) {
        return {
          ...prep,
          order: { ...o, offLimits: o.offLimits.slice(0, -1) },
        };
      }
      return {
        ...prep,
        order: { ...o, needsSignOff: o.needsSignOff.slice(0, -1) },
      };
    }
    case "reuse":
      return { ...prep, reuse: prep.reuse.slice(0, -1) };
    case "tests":
      return {
        ...prep,
        pack: { ...prep.pack, tests: prep.pack.tests.slice(0, -1) },
      };
    case "pack":
      return {
        ...prep,
        pack: {
          ...prep.pack,
          files: prep.pack.files.slice(0, -1),
          truncated: true,
        },
      };
  }
}

/**
 * Fit `prep` into `budget` tokens (a hard cap: the result, including its own
 * `trimmed` block, never exceeds the budget). Lists are ranked best-first,
 * so trimming drops from the end and each section keeps its best item first.
 *
 * Order: reserved sections down to their share → pack files (to 1) → tests →
 * notes → reserved sections to one item → everything to its floor of zero
 * (the pack keeps one file) → the last pack file's `why`, body, signatures
 * and symbols.
 */
export function fitPrepareToBudget(
  prep: PrepareChange,
  budget?: number,
): PrepareChange {
  const limit = clampPrepareBudget(budget);
  if (prepareResponseTokens(prep) <= limit) return prep;
  const before = counts(prep);
  let out = prep;
  const withTrimmed = (value: PrepareChange): PrepareChange => {
    const after = counts(value);
    const cut = PREPARE_TRIM_SECTIONS.filter((s) => after[s] < before[s]).map(
      (section) => ({
        section,
        kept: after[section],
        total: before[section],
      }),
    );
    const trimmed: PrepareTrimmed = {
      budgetTokens: limit,
      tokens: 0,
      cut,
      hint:
        limit < PREPARE_RESPONSE_CEILING
          ? `Trimmed to ${limit} tokens. Ask again with a larger budget (up to ${PREPARE_RESPONSE_CEILING}), or call blast_radius / graph on a specific file.`
          : "Trimmed to the ceiling. Call blast_radius / graph on a specific file for the rest.",
    };
    // The count is part of what it counts: settle on a true number.
    let result: PrepareChange = { ...value, trimmed };
    for (let i = 0; i < 4; i += 1) {
      const tokens = prepareResponseTokens(result);
      if (result.trimmed?.tokens === tokens) break;
      result = { ...value, trimmed: { ...trimmed, tokens } };
    }
    return result;
  };
  const fits = (value: PrepareChange) =>
    prepareResponseTokens(withTrimmed(value)) <= limit;

  const reserved = ["reuse", "conventions", "order"] as const;
  // 1. Reserved sections down to their share.
  for (const section of reserved) {
    const share = Math.floor(limit * PREPARE_RESERVES[section]);
    while (
      !fits(out) &&
      counts(out)[section] > 1 &&
      sectionTokens(out, section) > share
    ) {
      out = shrink(out, section);
    }
  }
  // 2. The file list first, then tests, notes; then reserved sections to one
  //    item; then everything to its floor.
  const steps: ReadonlyArray<readonly [PrepareTrimSection, number]> = [
    ["pack", 1],
    ["tests", 0],
    ["notes", 0],
    ["reuse", 1],
    ["conventions", 1],
    ["order", 1],
    ["reuse", 0],
    ["conventions", 0],
    ["order", 0],
  ];
  for (const [section, floor] of steps) {
    while (
      !fits(out) &&
      counts(out)[section] > Math.max(floor, FLOOR[section])
    ) {
      out = shrink(out, section);
    }
  }
  // 3. Last resort: shorten the remaining file's reasons, body, signatures
  //    and symbols (a barrel file can carry hundreds of each).
  while (!fits(out)) {
    const file = out.pack.files[0];
    if (!file) break;
    let next: typeof file;
    if (file.why.length > 1) {
      next = { ...file, why: file.why.slice(0, -1) };
    } else if (file.body) {
      const { body: _body, ...rest } = file;
      next = rest;
    } else if (file.signatures.length > 0) {
      next = { ...file, signatures: file.signatures.slice(0, -1) };
    } else if (file.symbols.length > 0) {
      next = { ...file, symbols: file.symbols.slice(0, -1) };
    } else break;
    out = { ...out, pack: { ...out.pack, files: [next] } };
  }
  const result = withTrimmed(out);
  if (prepareResponseTokens(result) <= limit) return result;
  // 4. Tiny budgets: the `trimmed` block and an echoed long task are the
  //    only things left. Keep a terse block and cut the echoed task.
  const terse = (value: PrepareChange): PrepareChange => {
    const trimmed: PrepareTrimmed = {
      budgetTokens: limit,
      tokens: 0,
      cut: [],
      hint: "Trimmed; ask with a larger budget.",
    };
    let r: PrepareChange = { ...value, trimmed };
    for (let i = 0; i < 4; i += 1) {
      const tokens = prepareResponseTokens(r);
      if (r.trimmed?.tokens === tokens) break;
      r = { ...value, trimmed: { ...trimmed, tokens } };
    }
    return r;
  };
  let tight = terse(out);
  while (prepareResponseTokens(tight) > limit && out.pack.task.length > 16) {
    out = {
      ...out,
      pack: {
        ...out.pack,
        task: `${out.pack.task.slice(0, Math.floor(out.pack.task.length / 2))}…`,
      },
    };
    tight = terse(out);
  }
  return tight;
}
