import { ok, type ChangeReceipt } from "@repo-prism/shared";
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

/** How long one call waits for the background checks (website round). */
export const RECEIPT_WAIT_MS = 20_000;
/** Calls that may come back still running before the agent reports that. */
export const RECEIPT_POLLS = 3;
const polls = new Map<string, number>();

/**
 * A receipt still waiting on its checks says what to do next: call again a
 * bounded number of times, then report it as not proven yet.
 */
export function withNextStep<T extends ChangeReceipt>(
  receipt: T,
): T | (T & { next: string }) {
  if (receipt.checksState !== "pending") {
    polls.delete(receipt.id);
    return receipt;
  }
  const seen = (polls.get(receipt.id) ?? 0) + 1;
  polls.set(receipt.id, seen);
  if (polls.size > 100) polls.delete(polls.keys().next().value!);
  const left = RECEIPT_POLLS - seen;
  return {
    ...receipt,
    next:
      left > 0
        ? `Checks still running: call receipt again for the result (${left} more ${left === 1 ? "try" : "tries"}).`
        : "Checks still running: report NOT PROVEN (checks still running) and stop polling.",
  };
}

export const receipt = defineTool({
  name: "receipt",
  title: "Change receipt",
  description:
    "What this session changed and whether it is proven: changed files, dependents, the tests that reach them, and a verdict — SHIP, NOT PROVEN (reason, with the cheapest check that would prove it) or NO-SHIP. Checks run in the background and each call waits up to 20 s for them; while they run, `next` says whether to call again. Call this before saying a coding task is done and quote the verdict in one line.",
  inputSchema: {
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The agent session, when the host gives one. Scopes the receipt to edits made since that session began.",
      ),
    waitMs: z
      .number()
      .int()
      .min(0)
      .max(60_000)
      .optional()
      .describe(
        `How long to wait for the checks before answering (default ${RECEIPT_WAIT_MS}).`,
      ),
  },
  readOnly: true,
  async call({ workspace }, args) {
    const result = await receiptService().receipt(workspace, {
      ...(args.sessionId ? { sessionId: args.sessionId } : {}),
      waitMs: args.waitMs ?? RECEIPT_WAIT_MS,
    });
    return result.ok ? ok(withNextStep(result.value)) : result;
  },
});
