/**
 * Prepare's budget constants and the `trimmed` block's shape. A leaf module:
 * `schemas.ts` needs these for `PrepareChangeSchema`, and `prepare-budget.ts`
 * needs `PrepareChange` from `schemas.ts`, so neither may own them.
 */

import { z } from "zod";

export const PREPARE_RESPONSE_BUDGET = 2000;
export const PREPARE_RESPONSE_CEILING = 6000;
/** What the prompt-submit hook asks for (ADR-0065). */
export const AUTO_PREPARE_BUDGET = 1200;

export const PREPARE_TRIM_SECTIONS = [
  "conventions",
  "notes",
  "order",
  "reuse",
  "tests",
  "pack",
] as const;
export type PrepareTrimSection = (typeof PREPARE_TRIM_SECTIONS)[number];

export const PrepareTrimmedSchema = z.object({
  budgetTokens: z.number().int().positive(),
  tokens: z.number().int().nonnegative(),
  cut: z.array(
    z.object({
      section: z.enum(PREPARE_TRIM_SECTIONS),
      kept: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  ),
  hint: z.string().min(1),
});
export type PrepareTrimmed = z.infer<typeof PrepareTrimmedSchema>;
