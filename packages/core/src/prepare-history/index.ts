/**
 * Prepare history: the last packs Prism handed an agent, read back by the
 * receipt and the edit snapshot.
 *
 * Import from `@repo-prism/core/prepare-history`. The Core barrel opens
 * SQLite; this entry only touches `~/.prism` files.
 */

export * from "./prepare-last.js";
