import {
  type GraphNodeDto,
  type IndexSnapshot,
  unsafeNodeId,
} from "@prism/shared";

/**
 * Thin M-009 helper: map analyzed index files to file nodes only.
 * Import/edge resolution belongs to M-010+.
 */
export function nodesFromIndexSnapshot(
  snapshot: IndexSnapshot,
): GraphNodeDto[] {
  return snapshot.files
    .filter((f) => f.status === "analyzed")
    .map((f) => ({
      id: unsafeNodeId(`file:${f.path}`),
      kind: "file",
      label: f.path,
      attrs: {
        path: f.path,
        pluginId: f.pluginId,
        contentHash: f.contentHash,
        symbolCount: f.symbols.length,
        importCount: f.imports.length,
        exportCount: f.exports.length,
      },
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
