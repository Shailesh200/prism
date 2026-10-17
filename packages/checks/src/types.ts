import { z } from "zod";

/** One allowlisted check. Never a user-supplied shell string. */
export const VerifyStepSchema = z.discriminatedUnion("kind", [
  z.object({
    name: z.string().min(1),
    kind: z.literal("package-script"),
    script: z.string().min(1),
  }),
  z.object({
    name: z.string().min(1),
    kind: z.literal("argv"),
    argv: z.array(z.string().min(1)).min(1),
  }),
]);
export type VerifyStep = z.infer<typeof VerifyStepSchema>;

export const VerifyPlanSchema = z.object({
  steps: z.array(VerifyStepSchema),
  absent: z.array(
    z.object({
      name: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
  source: z.enum(["package.json", "pyproject", "go.mod", "Cargo.toml", "none"]),
  provenance: z.enum(["measured", "unavailable"]),
});
export type VerifyPlan = z.infer<typeof VerifyPlanSchema>;
