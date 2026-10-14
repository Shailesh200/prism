import { z } from "zod";

/**
 * Lenses (ADR-0059): user-owned review lenses. Prism stores the definition,
 * memory and history; the host's own model does the thinking.
 */

export const LENS_ID = /^[a-z][a-z0-9-]{0,39}$/;
export const LensIdSchema = z.string().regex(LENS_ID);

/** Where a lens fact came from. Re-seeding replaces `seeded` facts only. */
export const LENS_FACT_ORIGINS = ["seeded", "learned", "user"] as const;
export const LensFactOriginSchema = z.enum(LENS_FACT_ORIGINS);
export type LensFactOrigin = z.infer<typeof LensFactOriginSchema>;

/** The Prism reads a lens is fed with. */
export const LENS_EVIDENCE = [
  "boundaries",
  "cycles",
  "rationale",
  "off-limits",
  "blast",
  "test-impact",
  "verify-plan",
  "test-layout",
  "reuse",
  "house-style",
  "duplicates",
] as const;
export const LensEvidenceSchema = z.enum(LENS_EVIDENCE);
export type LensEvidence = z.infer<typeof LensEvidenceSchema>;

export const LensFactSchema = z.object({
  id: z.string().min(1),
  /** The lens that holds this fact. */
  lens: LensIdSchema,
  text: z.string().min(1),
  origin: LensFactOriginSchema,
  /** Repo-relative path the fact was read from (seeded facts always cite one). */
  source: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
});
export type LensFact = z.infer<typeof LensFactSchema>;

export const LensDefinitionSchema = z.object({
  id: LensIdSchema,
  name: z.string().min(1).max(60),
  role: z.string().min(1).max(200),
  focus: z.string().min(1).max(600),
  tone: z.string().max(200).default(""),
  /** Each item must be provable from Prism data or a command. */
  checklist: z.array(z.string().min(1).max(300)).max(20),
  evidence: z.array(LensEvidenceSchema),
  /**
   * How the host should work while this lens is active. Empty on a custom
   * lens that has not written one; the role and checklist still apply.
   */
  procedure: z.string().max(2500).default(""),
  enabled: z.boolean().default(true),
  /** True for the Architect / QA / Dev defaults Prism seeded. */
  seededDefault: z.boolean().default(false),
});
export type LensDefinition = z.infer<typeof LensDefinitionSchema>;

export const LensVerdictValueSchema = z.enum(["pass", "concern", "fail"]);
export type LensVerdictValue = z.infer<typeof LensVerdictValueSchema>;

export const LensReviewRecordSchema = z.object({
  id: z.string().min(1),
  lens: LensIdSchema,
  at: z.string().datetime(),
  /** What was reviewed: the task text or "session diff". */
  subject: z.string().min(1).max(500),
  /** Evidence lines the lens was given (bounded). */
  evidence: z.array(z.string()).max(60),
  verdict: LensVerdictValueSchema,
  /** The reasoning the host model wrote back — not hidden thinking. */
  reasoning: z.string().max(8000),
  /** Checklist items the lens marked as failing. */
  failedChecks: z.array(z.string()).max(20).default([]),
  /** True when the host ran lenses sequentially in one context. */
  sequential: z.boolean().default(false),
  override: z
    .object({
      at: z.string().datetime(),
      note: z.string().min(1).max(500),
    })
    .optional(),
});
export type LensReviewRecord = z.infer<typeof LensReviewRecordSchema>;

/** One lens as the Dashboard and `lens show` see it. */
export const LensViewSchema = z.object({
  definition: LensDefinitionSchema,
  facts: z.array(LensFactSchema),
  history: z.array(LensReviewRecordSchema),
});
export type LensView = z.infer<typeof LensViewSchema>;
