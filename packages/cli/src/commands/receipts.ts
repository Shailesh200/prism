/**
 * `prism receipts` (M-092): the change receipts the stop hook wrote.
 *
 * `prism receipts` lists the newest first. `prism receipts show [n]` (or
 * `--last`) prints one (1 = newest) as text, or `--as markdown` / `--as svg`
 * for a PR comment or a card to share.
 */

import {
  err,
  ok,
  PrismErrorCode,
  prismError,
  renderReceiptTerminal,
  renderReceiptMarkdown,
  renderReceiptSvg,
  shipVerdictLabel,
  type ChangeReceipt,
} from "@repo-prism/shared";
import { listStoredReceipts } from "@repo-prism/shared/receipt-store";
import { renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";

export type ReceiptRow = {
  readonly at: string;
  readonly verdict: string;
  readonly durationMs?: number;
  readonly sessionId?: string;
  readonly text: string;
  readonly receipt?: ChangeReceipt;
};

/** Stored receipts (plan §5.7), newest first, with checks once they finish. */
export function readReceiptHistory(root: string): ReceiptRow[] {
  return listStoredReceipts(root).map((receipt) => ({
    at: receipt.generatedAt,
    verdict: shipVerdictLabel(receipt),
    durationMs: receipt.durationMs,
    ...(receipt.sessionId ? { sessionId: receipt.sessionId } : {}),
    text: renderReceiptTerminal(receipt),
    receipt,
  }));
}

export const receiptsCommand: CommandHandler = async (context) => {
  const rows = readReceiptHistory(context.workspace.path);
  const action = context.args.flag("last")
    ? "show"
    : (context.args.positionals[0] ?? "list");

  if (action === "show") {
    const n = Number(context.args.positionals[1] ?? "1");
    const row = Number.isInteger(n) && n >= 1 ? rows[n - 1] : undefined;
    if (!row) {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          rows.length === 0
            ? "No receipts yet. The stop hook writes one when an agent session with edits ends."
            : `No receipt ${context.args.positionals[1]}. There are ${rows.length}; 1 is the newest.`,
        ),
      );
    }
    const as = context.args.option("as") ?? "text";
    const body =
      row.receipt && as === "markdown"
        ? renderReceiptMarkdown(row.receipt)
        : row.receipt && as === "svg"
          ? renderReceiptSvg(row.receipt)
          : row.receipt
            ? renderReceiptTerminal(row.receipt)
            : row.text;
    return ok({ data: row, human: () => body });
  }

  if (action !== "list") {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        "Usage: prism receipts [list|show [n]|--last] [--as text|markdown|svg]",
      ),
    );
  }

  const limit = Number(context.args.option("limit") ?? "50");
  const shown = rows.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 50);
  return ok({
    data: { total: rows.length, items: shown },
    human({ color }) {
      if (rows.length === 0) {
        return "No receipts yet. The stop hook writes one when an agent session with edits ends.";
      }
      return [
        renderHeading(`Receipts (${shown.length} of ${rows.length})`, color),
        "",
        ...shown.map((row, i) => {
          const secs =
            row.durationMs !== undefined
              ? ` · ${(row.durationMs / 1000).toFixed(1)}s`
              : "";
          return `${String(i + 1).padStart(3)}  ${row.at.slice(0, 16).replace("T", " ")}  ${row.verdict}${secs}`;
        }),
        "",
        "Show one: prism receipts show <n>",
      ].join("\n");
    },
  });
};
