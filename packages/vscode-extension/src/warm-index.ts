import type { PrismLogger } from "./logger.js";
import type { PrismSession } from "@repo-prism/host-session";

/**
 * Minimal session surface for warm-indexing — anything that can open a root
 * and be closed (the real `PrismSession`, or a test fake).
 */
export type WarmIndexSession = Pick<PrismSession, "open" | "close">;

export type WarmIndexDeps = {
  readonly createSession: () => WarmIndexSession;
  readonly log: Pick<PrismLogger, "info" | "warn">;
};

/**
 * Best-effort background index of non-active multi-root folders (M-057 P-B7).
 * Every workspace folder gets a warm index cache so the status-bar folder
 * switcher re-opens in milliseconds instead of a cold full index. Sequential
 * on purpose: parallel first-indexes of large repos would thrash the shared
 * extension-host process. A folder that fails is skipped — it never blocks
 * the rest.
 */
export async function warmIndexOtherFolders(
  roots: readonly string[],
  deps: WarmIndexDeps,
): Promise<void> {
  for (const root of roots) {
    let warm: WarmIndexSession | undefined;
    try {
      warm = deps.createSession();
      const opened = await warm.open(root);
      if (opened.ok) {
        deps.log.info(`Warm-indexed multi-root folder ${root}`);
      } else {
        deps.log.warn(`Warm-index skipped ${root}: ${opened.error.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.log.warn(`Warm-index failed ${root}: ${msg}`);
    } finally {
      warm?.close();
    }
  }
}
