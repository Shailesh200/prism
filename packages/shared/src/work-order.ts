/**
 * Work order DTO + advisory hook (M-076).
 *
 * States are allowed / blocked / needsSignOff. A write is vetoed only when
 * an Accepted ADR has armed the hook — default is advisory copy.
 */

import { z } from "zod";
import { classifyFileRole } from "./file-role.js";

export const WORK_ORDER_STATES = [
  "allowed",
  "blocked",
  "needsSignOff",
] as const;
export type WorkOrderState = (typeof WORK_ORDER_STATES)[number];
export const WorkOrderStateSchema = z.enum(WORK_ORDER_STATES);

export const WorkOrderOffLimitSchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1),
});
export type WorkOrderOffLimit = z.infer<typeof WorkOrderOffLimitSchema>;

export const WorkOrderSchema = z.object({
  inScope: z.array(z.string().min(1)),
  offLimits: z.array(WorkOrderOffLimitSchema),
  needsSignOff: z.array(z.string().min(1)),
  /** True unless an Accepted work-order veto ADR armed the hook. */
  advisory: z.boolean(),
  hookArmed: z.boolean(),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const WorkOrderEvaluationSchema = z.object({
  path: z.string().min(1),
  state: WorkOrderStateSchema,
  veto: z.boolean(),
  copy: z.string().min(1),
});
export type WorkOrderEvaluation = z.infer<typeof WorkOrderEvaluationSchema>;

export const EMPTY_WORK_ORDER: WorkOrder = {
  inScope: [],
  offLimits: [],
  needsSignOff: [],
  advisory: true,
  hookArmed: false,
};

const VENDOR_SEGMENT = /(^|\/)vendor(\/|$)/i;

/** Generated (file-role) or a `vendor/` path segment. */
export function isWorkOrderOffLimitPath(path: string): boolean {
  return offLimitReason(path) !== undefined;
}

export function offLimitReason(
  path: string,
): "generated" | "vendor" | undefined {
  const normalized = path.replace(/\\/g, "/");
  if (VENDOR_SEGMENT.test(normalized)) return "vendor";
  if (classifyFileRole(normalized) === "generated") return "generated";
  return undefined;
}

/**
 * An Accepted ADR that mentions a work-order write veto. Table form
 * (`| Status | Accepted |`) and `Status: Accepted` both count.
 */
export function isAcceptedWorkOrderVetoAdr(markdown: string): boolean {
  const accepted =
    /\|\s*Status\s*\|\s*Accepted\s*\|/i.test(markdown) ||
    /^Status:\s*Accepted\b/im.test(markdown);
  if (!accepted) return false;
  return /work[- ]order|write veto|veto writes/i.test(markdown);
}

export function workOrderStateForPath(
  path: string,
  order: WorkOrder,
): WorkOrderState {
  const normalized = path.replace(/\\/g, "/");
  if (
    order.offLimits.some(
      (row) =>
        row.path === normalized ||
        normalized.startsWith(`${row.path.replace(/\/$/, "")}/`),
    )
  ) {
    return "blocked";
  }
  if (order.needsSignOff.includes(normalized)) return "needsSignOff";
  if (order.inScope.includes(normalized)) return "allowed";
  const reason = offLimitReason(normalized);
  if (reason) return "blocked";
  return "allowed";
}

/** Stitch labels. Blocked / needsSignOff stay “not armed” until the ADR. */
export function workOrderStateCopy(
  state: WorkOrderState,
  hookArmed: boolean,
): string {
  switch (state) {
    case "allowed":
      return "Allowed — this path is in the work order.";
    case "blocked":
      return hookArmed
        ? "Blocked — do not write this path (generated or vendor)."
        : "Blocked (not armed) — generated or vendor; advisory only until the work-order hook ADR is accepted.";
    case "needsSignOff":
      return hookArmed
        ? "Needs sign-off — do not write until a human signs off."
        : "Needs sign-off (not armed) — high blast or shared ownership; advisory only.";
  }
}

export function evaluateWorkOrderWrite(
  path: string,
  order: WorkOrder | null | undefined,
): WorkOrderEvaluation {
  const normalized = path.replace(/\\/g, "/");
  const resolved = order ?? {
    ...EMPTY_WORK_ORDER,
    ...(offLimitReason(normalized)
      ? {
          offLimits: [
            {
              path: normalized,
              reason: offLimitReason(normalized)!,
            },
          ],
        }
      : {}),
  };
  const state = workOrderStateForPath(normalized, resolved);
  const hookArmed = resolved.hookArmed;
  const veto = hookArmed && (state === "blocked" || state === "needsSignOff");
  return {
    path: normalized,
    state,
    veto,
    copy: workOrderStateCopy(state, hookArmed),
  };
}
