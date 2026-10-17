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

/**
 * Data-backed lens checks (plan §5.3). Prism computes each from the index,
 * the diff and the receipt; no model is called.
 */
export const LENS_CHECK_IDS = [
  "new_cross_package_edge",
  "new_value_cycle",
  "off_limits_touched",
  "reuse_missed",
  "new_dependency_added",
  "untested_new_branch",
  "untested_changed_symbol",
  "dependents_not_in_diff",
  "test_reaches_but_not_run",
] as const;
export const LensCheckIdSchema = z.enum(LENS_CHECK_IDS);
export type LensCheckId = z.infer<typeof LensCheckIdSchema>;

export const LensCheckStatusSchema = z.enum([
  "pass",
  "concern",
  "fail",
  "overruled",
]);
export type LensCheckStatus = z.infer<typeof LensCheckStatusSchema>;

/** Evidence lines one finding keeps; the rest are counted in the last line. */
export const LENS_EVIDENCE_MAX = 20;

/** One computed check result, with the evidence that decided it. */
export const LensFindingSchema = z.object({
  lens: z.string().min(1),
  check: LensCheckIdSchema,
  status: LensCheckStatusSchema,
  evidence: z.array(z.string().min(1)).max(LENS_EVIDENCE_MAX),
  /** Remembered overrule note, when `status` is `overruled` (CL-2). */
  note: z.string().optional(),
});
export type LensFinding = z.infer<typeof LensFindingSchema>;

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
  /**
   * Phrases that choose this lens when they appear in a prompt (plan §5.3,
   * CL-6). Whole-phrase, case-insensitive; never inside code or quotes.
   */
  triggers: z.array(z.string().min(1).max(80)).max(20).default([]),
  /** Data-backed checks this lens runs (plan §5.3). */
  checks: z.array(LensCheckIdSchema).max(20).default([]),
  /** Remembered overrules (CL-2): same check on the same fingerprint → overruled. */
  overrules: z
    .array(
      z.object({
        check: LensCheckIdSchema,
        /** `path:<sha256 of content>` or `symbol:<name>:<signature hash>`. */
        fingerprint: z.string().min(1),
        note: z.string().min(1).max(500),
        at: z.string().datetime(),
      }),
    )
    .max(200)
    .default([]),
  /** Last edit, for breaking a trigger tie (CL-10). */
  updatedAt: z.string().datetime().optional(),
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
