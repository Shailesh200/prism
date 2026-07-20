import {
  MapBookmarkStoreSchema,
  parseDto,
  type MapBookmark,
  type MapBookmarkStore,
} from "@prism/shared";

/** Default empty local bookmark store (`.prism/bookmarks.json`). */
export function emptyBookmarkStore(): MapBookmarkStore {
  return { version: 1, bookmarks: [] };
}

export function parseBookmarkStore(
  data: unknown,
): { ok: true; value: MapBookmarkStore } | { ok: false; message: string } {
  return parseDto(MapBookmarkStoreSchema, data);
}

export function sortBookmarks(
  bookmarks: readonly MapBookmark[],
): MapBookmark[] {
  return [...bookmarks].sort((a, b) => a.id.localeCompare(b.id));
}
