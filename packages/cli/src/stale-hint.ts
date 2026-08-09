/**
 * Compare snapshot.indexedAt against working-tree mtimes (M-057 P-B11).
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { IndexSnapshot } from "@repo-prism/shared";

const SAMPLE_LIMIT = 64;
/** Ignore tiny clock skew between indexedAt and fs mtime. */
const SKEW_MS = 1500;

export async function indexLooksStale(
  snapshot: IndexSnapshot,
): Promise<boolean> {
  const indexedAtMs = Date.parse(snapshot.indexedAt);
  if (!Number.isFinite(indexedAtMs)) return false;

  const candidates = snapshot.files
    .filter((f) => f.status === "analyzed")
    .slice(0, SAMPLE_LIMIT);

  for (const file of candidates) {
    try {
      const st = await stat(join(snapshot.rootPath, file.path));
      if (st.mtimeMs > indexedAtMs + SKEW_MS) return true;
    } catch {
      // Missing path is not treated as stale here.
    }
  }
  return false;
}

export const STALE_INDEX_HINT =
  "Prism: index may be stale — working-tree files are newer than the last index. Run `prism index`.";
