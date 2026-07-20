/** @prism/indexer — inventory (M-005), index jobs (M-007), SQLite cache (M-008). */

export {
  BUILTIN_IGNORE_PATTERNS,
  BINARY_SNIFF_BYTES,
  DEFAULT_MAX_FILE_BYTES,
} from "./constants.js";
export {
  HASH_ALGO,
  hashBufferSha256,
  hashFileSha256,
  looksBinary,
} from "./hash.js";
export { createIgnoreEngine, type IgnoreEngine } from "./ignore-engine.js";
export { inventoryWorkspace, type InventoryOptions } from "./inventory.js";
export { resolveWorkspaceRoot } from "./workspace-root.js";
export {
  DEFAULT_INDEX_CONCURRENCY,
  runIndexJob,
  snapshotToSummary,
  type IndexJobOptions,
} from "./index-job.js";
export { createIndexerEngine, type IndexerEngine } from "./default-port.js";
export {
  openIndexCache,
  wipePrismCache,
  type IndexCacheDb,
} from "./cache/db.js";
export { indexSqlitePath, prismCacheDir } from "./cache/paths.js";
export {
  SCHEMA_VERSION,
  migrate,
  readSchemaVersion,
} from "./cache/migrations.js";
