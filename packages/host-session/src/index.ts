/**
 * The Core-backed request surface a Prism UI host answers.
 *
 * This used to live inside `@repo-prism/vscode-extension`, which meant the
 * only way to serve the intelligence UI over HTTP was the extension's own
 * loopback bridge — an unauthenticated server that died with the editor
 * (ADR-0048). Nothing here touches an editor API: the one editor-specific
 * behaviour, renaming through a workspace edit, is injected via
 * `HostDispatchOptions.applyRename`.
 */
export { applyRenameOnDisk } from "./apply-rename-disk.js";
export {
  dispatchHostRequest,
  type HostDispatchOptions,
  type HostDispatchState,
} from "./host-dispatch.js";
export { PrismSession } from "./session.js";
export * from "./protocol.js";
export * from "./protocol-guards.js";
