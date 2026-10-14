/**
 * `prism` with no subcommand (plan C-10, CLI-5): index the repository and say
 * so in one line. No report card, no health score, no HTML graph page (all deleted
 * in 2.0, §0.4 #21 and #35).
 */

import { ok } from "@repo-prism/shared";
import type { CommandHandler } from "../runtime.js";

export function firstRunLine(files: number, elapsedMs: number): string {
  const seconds = (elapsedMs / 1000).toFixed(1);
  return `Indexed ${files} files in ${seconds} s. Try: prism review`;
}

export const firstRunCommand: CommandHandler = async (context) => {
  context.progress("Indexing…");
  const started = performance.now();
  const opened = await context.open();
  if (!opened.ok) return opened;
  const snapshot = opened.value.getIndex();
  if (!snapshot.ok) return snapshot;
  const elapsedMs = Math.round(performance.now() - started);
  const files = snapshot.value.files.length;
  return ok({
    data: { files, elapsedMs },
    human: () => firstRunLine(files, elapsedMs),
  });
};
