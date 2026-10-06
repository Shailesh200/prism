/**
 * `prism-mcp --hook stop` (ADR-0058).
 *
 * The plugin hook script stays dependency-free. When the agent stops it
 * spawns this, which opens the workspace, runs the receipt, and prints the
 * Claude Code hook JSON on stdout. Nothing else may write stdout.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Prism } from "@repo-prism/core";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import {
  buildChangeReceipt,
  receiptFeedback,
  renderReceipt,
} from "./receipt.js";

export async function runMcpHook(argv: readonly string[]): Promise<void> {
  const at = argv.indexOf("--hook");
  const event = argv[at + 1] ?? "stop";
  if (event !== "stop") {
    process.stdout.write("{}\n");
    return;
  }
  const opened = Prism.create().openRepository(process.cwd());
  if (!opened.ok) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext: `Prism could not open this repository (${opened.error.message}).`,
        },
      })}\n`,
    );
    return;
  }
  try {
    const receipt = await buildChangeReceipt(opened.value);
    if (!receipt.ok) {
      process.stdout.write(
        `${JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: `Prism could not build a change receipt (${receipt.error.message}).`,
          },
        })}\n`,
      );
      return;
    }
    const text = renderReceipt(receipt.value);
    try {
      const dir = join(workspacePrismDir(opened.value.rootPath), "receipts");
      mkdirSync(dir, { recursive: true });
      appendFileSync(
        join(dir, "history.jsonl"),
        `${JSON.stringify({ at: new Date().toISOString(), text })}\n`,
      );
    } catch {
      /* history must not block the receipt the agent reads */
    }
    const feedback = receiptFeedback(receipt.value);
    const payload = feedback
      ? {
          decision: "block",
          reason: feedback,
          hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: text,
          },
        }
      : {
          hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: text,
          },
        };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } finally {
    opened.value.close();
  }
}
