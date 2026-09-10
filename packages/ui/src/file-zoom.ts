import type { TreeEntry } from "./file-tree.js";

/** First page of file-zoom cards (M-062 P-D6). */
export const FILE_ZOOM_CARD_PAGE_SIZE = 24;

/**
 * At this many siblings, cards become unreadable — fall back to the
 * virtualised explorer list instead of laying out a wall of nodes.
 */
export const FILE_ZOOM_EXPLORER_THRESHOLD = 80;

export type FileZoomPresentation = {
  readonly mode: "cards" | "explorer";
  /** Max cards shown at each tree level when `mode` is `cards`. */
  readonly cardLimit: number;
  readonly hiddenCount: number;
  readonly canShowMore: boolean;
};

/**
 * Decide whether this folder of cards stays on the canvas or becomes a list.
 *
 * `page` is 1-based; each extra page reveals another `FILE_ZOOM_CARD_PAGE_SIZE`
 * siblings. Large folders skip cards entirely.
 */
export function presentFileZoom(
  roots: readonly TreeEntry[],
  page: number,
): FileZoomPresentation {
  if (roots.length > FILE_ZOOM_EXPLORER_THRESHOLD) {
    return {
      mode: "explorer",
      cardLimit: 0,
      hiddenCount: roots.length,
      canShowMore: false,
    };
  }
  const cardLimit = FILE_ZOOM_CARD_PAGE_SIZE * Math.max(1, page);
  const hiddenCount = Math.max(0, roots.length - cardLimit);
  return {
    mode: "cards",
    cardLimit,
    hiddenCount,
    canShowMore: hiddenCount > 0,
  };
}
