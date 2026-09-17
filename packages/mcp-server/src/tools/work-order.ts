import { z } from "zod";
import { evaluateWorkOrderWrite, ok } from "@repo-prism/shared";
import { defineTool } from "../tool-registry.js";

export const workOrder = defineTool({
  name: "work_order",
  title: "Work order",
  description:
    "The work order for a task: in-scope files, off-limits (generated or vendor), and paths that need sign-off (high blast or shared ownership). Same compute as prepare_change.order. Optional path evaluates the advisory hook for that write — veto is false unless an Accepted ADR has armed the hook. Never file bodies.",
  inputSchema: {
    task: z
      .string()
      .min(1)
      .describe("What you are about to change, in plain language."),
    path: z
      .string()
      .min(1)
      .optional()
      .describe("Workspace-relative path to evaluate against the work order."),
  },
  async call({ workspace }, args) {
    const result = await workspace.prepareChange({ task: args.task });
    if (!result.ok) return result;
    const order = result.value.order;
    if (!args.path) return ok(order);
    return ok({
      ...order,
      evaluation: evaluateWorkOrderWrite(args.path, order),
    });
  },
});
