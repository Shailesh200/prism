import { z } from "zod";

export const RunPhaseSchema = z.enum([
  "starting",
  "running",
  "thinking",
  "tool",
  "editing",
  "done",
  "failed",
  "cancelled",
]);
export type RunPhase = z.infer<typeof RunPhaseSchema>;
