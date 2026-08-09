/**
 * Format indexer `onProgress` events for stderr (M-057 P-B5).
 */

import type { IndexProgressEvent } from "@repo-prism/shared";

export function formatIndexProgress(event: IndexProgressEvent): string {
  const parts = [`index:${event.phase}`];
  if (
    typeof event.filesDone === "number" &&
    typeof event.filesTotal === "number"
  ) {
    parts.push(`${event.filesDone}/${event.filesTotal}`);
  } else if (typeof event.filesDone === "number") {
    parts.push(`${event.filesDone} files`);
  }
  if (event.message) parts.push(event.message);
  else if (event.path) parts.push(event.path);
  return parts.join(" ");
}
