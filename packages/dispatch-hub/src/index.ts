export const PACKAGE_NAME = "@repo-prism/dispatch-hub" as const;

export {
  CONSOLE_ALIAS_HOST,
  CONSOLE_HOST,
  HUB_PORT,
  dashboardUrl,
  hubEnabled,
  hubHome,
  hubPort,
} from "./paths.js";
export {
  ensureHub,
  peekHub,
  resolveHubBin,
  ensurePlayground,
  parkPlayground,
  type HubHandle,
} from "./ensure.js";
export {
  PLAYGROUND_PORT,
  playgroundUrl,
  type PlaygroundHandle,
} from "./playground.js";
export { startHub, type HubOptions, type StartedHub } from "./server.js";
export { formatJobFinishedNotice, type JobNoticeCopy } from "./notice.js";
export { originAllowed, tokenFromRequest, tokensMatch } from "./auth.js";
export { diffJobs, collectJobs, isInFlight, isTerminal } from "./watch.js";
export { toSnapshot } from "./snapshot.js";
export {
  registerWorkspace,
  unregisterWorkspace,
  workspaceLabel,
  loadRegistry,
} from "./registry.js";
// Statusline is the `prism-hub statusline` CLI only. Re-exporting it here
// pulled `formatDuration` into every MCP import of this package.
export { readHubRecord, newHubToken } from "./hub-record.js";
export type {
  HubEvent,
  HubRecord,
  JobSnapshot,
  WorkspaceEntry,
} from "./types.js";
