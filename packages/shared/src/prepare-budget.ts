/**
 * One token budget for the whole Prepare response (M-093, program §5.1).
 *
 * Tokens are response bytes ÷ 4, the rule Envelope uses, so what Prepare
 * promises is what Envelope measures. Sections are trimmed from the least to
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

/** The pack keeps at least one file; everything else can go to zero. */
const FLOOR: Counts = {
  conventions: 0,
  notes: 0,
  order: 0,
  reuse: 0,
  tests: 0,
  pack: 1,
};

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
 * Fit `prep` into `budget` tokens. Returns it unchanged when it already
 * fits; otherwise trims in section order and adds `trimmed`.
 */
export function fitPrepareToBudget(
  prep: PrepareChange,
  budget?: number,
): PrepareChange {
  const limit = clampPrepareBudget(budget);
  if (prepareResponseTokens(prep) <= limit) return prep;
  const before = counts(prep);
  // Room for the `trimmed` block itself.
  const target = limit - 90;
  let out = prep;
  for (const section of PREPARE_TRIM_SECTIONS) {
    while (
      prepareResponseTokens(out) > target &&
      counts(out)[section] > FLOOR[section]
    ) {
      out = shrink(out, section);
    }
    if (prepareResponseTokens(out) <= target) break;
  }
  const after = counts(out);
  const cut = PREPARE_TRIM_SECTIONS.filter((s) => after[s] < before[s]).map(
    (section) => ({ section, kept: after[section], total: before[section] }),
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
  // The count is part of what it counts: writing it can add a digit, so
  // settle on a number that is true once written.
  let result: PrepareChange = { ...out, trimmed };
  for (let i = 0; i < 4; i += 1) {
    const tokens = prepareResponseTokens(result);
    if (result.trimmed?.tokens === tokens) break;
    result = { ...out, trimmed: { ...trimmed, tokens } };
  }
  return result;
}
