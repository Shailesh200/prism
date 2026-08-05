/**
 * Turn Core index progress into short log lines for MCP clients (GA UX).
 *
 * Throttled: every phase change, plus every 25 files during analyze. Flooding
 * `notifications/message` makes transcripts unreadable; silence looks hung.
 */

import type { IndexProgressEvent } from "@repo-prism/shared";

export type IndexProgressSink = (line: string) => void;

/**
 * Build a throttled reporter. Call the returned function with each Core event.
 */
export function createIndexProgressReporter(
  sink: IndexProgressSink,
): (event: IndexProgressEvent) => void {
  let lastPhase: string | undefined;
  let lastEmittedDone = -1;

  return (event: IndexProgressEvent) => {
    const phase = event.phase;
    const done = event.filesDone;
    const total = event.filesTotal;

    const phaseChanged = phase !== lastPhase;
    const milestone =
      typeof done === "number" &&
      (done === 0 ||
        done === total ||
        done - lastEmittedDone >= 25 ||
        lastEmittedDone < 0);

    if (!phaseChanged && !milestone && event.message === undefined) return;

    lastPhase = phase;
    if (typeof done === "number") lastEmittedDone = done;

    const counts =
      typeof done === "number" && typeof total === "number"
        ? ` (${done}/${total})`
        : "";
    const detail = event.message?.trim() ? ` — ${event.message.trim()}` : "";
    sink(`Indexing… ${phase}${counts}${detail}`);
  };
}
