/** @prism/indexer — workspace walk, ignore, hashing (M-005). */

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
