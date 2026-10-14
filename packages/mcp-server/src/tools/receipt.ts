import { z } from "zod";
import { defineTool } from "../tool-registry.js";
import {
  createReceiptService,
  type ReceiptService,
} from "../safety/receipt-service.js";

/**
 * One service per process: in the daemon it outlives every call, so checks
 * started by one stop are found by the next (plan §5.7, §5.10).
 */
let service: ReceiptService | undefined;
export function receiptService(): ReceiptService {
  service ??= createReceiptService({
    mode: process.env.PRISM_DAEMON === "1" ? "daemon" : "inproc",
  });
  return service;
}

export const receipt = defineTool({
  name: "receipt",
  title: "Change receipt",
  description:
    "What this session changed and whether it is proven: changed files, dependents, the tests that reach them, and a verdict — proven, not_proven(reason) or failed. Checks run in the background; calling again with the same edits returns the same receipt id, with the check results once they finish. Call this before saying a coding task is done and quote the verdict in one line.",
  inputSchema: {
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The agent session, when the host gives one. Scopes the receipt to edits made since that session began.",
      ),
  },
  readOnly: true,
  async call({ workspace }, args) {
    return await receiptService().receipt(
      workspace,
      args.sessionId ? { sessionId: args.sessionId } : {},
    );
  },
});
