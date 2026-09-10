import { describe, expect, it } from "vitest";
import type { TreeEntry } from "./file-tree.js";
import {
  FILE_ZOOM_CARD_PAGE_SIZE,
  FILE_ZOOM_EXPLORER_THRESHOLD,
  presentFileZoom,
} from "./file-zoom.js";

function roots(n: number): TreeEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `folder:p${i}`,
    name: `p${i}`,
    path: `p${i}`,
    kind: "folder" as const,
    children: [],
    fileCount: 0,
  }));
}

describe("presentFileZoom", () => {
  it("keeps a small folder on cards", () => {
    const next = presentFileZoom(roots(6), 1);
    expect(next.mode).toBe("cards");
    expect(next.cardLimit).toBe(FILE_ZOOM_CARD_PAGE_SIZE);
    expect(next.hiddenCount).toBe(0);
    expect(next.canShowMore).toBe(false);
  });

  it("caps the first page and offers Show more", () => {
    const next = presentFileZoom(roots(40), 1);
    expect(next.mode).toBe("cards");
    expect(next.cardLimit).toBe(FILE_ZOOM_CARD_PAGE_SIZE);
    expect(next.hiddenCount).toBe(40 - FILE_ZOOM_CARD_PAGE_SIZE);
    expect(next.canShowMore).toBe(true);
  });

  it("reveals another page of cards", () => {
    const next = presentFileZoom(roots(40), 2);
    expect(next.hiddenCount).toBe(0);
    expect(next.canShowMore).toBe(false);
  });

  it("falls back to the explorer past the sibling threshold", () => {
    const next = presentFileZoom(roots(FILE_ZOOM_EXPLORER_THRESHOLD + 1), 1);
    expect(next.mode).toBe("explorer");
    expect(next.canShowMore).toBe(false);
  });
});
