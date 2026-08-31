export const PACKAGE_NAME = "@repo-prism/dispatch-hub" as const;

export {
  HUB_PORT,
  dashboardUrl,
  hubEnabled,
  hubHome,
  hubPort,
} from "./paths.js";
export { ensureHub, peekHub, resolveHubBin, type HubHandle } from "./ensure.js";
export { startHub, type HubOptions, type StartedHub } from "./server.js";
export { formatJobFinishedNotice, type JobNoticeCopy } from "./notice.js";
export { originAllowed, tokenFromRequest, tokensMatch } from "./auth.js";
export { diffJobs, collectJobs, isInFlight, isTerminal } from "./watch.js";
export { toSnapshot } from "./snapshot.js";
export { registerWorkspace, workspaceLabel, loadRegistry } from "./registry.js";
export { readHubRecord, newHubToken } from "./hub-record.js";
export type {
  HubEvent,
  HubRecord,
  JobSnapshot,
  WorkspaceEntry,
} from "./types.js";
