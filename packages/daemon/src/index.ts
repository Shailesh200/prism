export const PACKAGE_NAME = "@repo-prism/daemon" as const;

export {
  BUILD_HEADER,
  callDaemonRoute,
  callDaemonTool,
  compareBuildIds,
  compareVersions,
  daemonHealth,
  daemonReady,
  daemonStatus,
  type DaemonHealth,
  ensureDaemon,
  reindexDaemonWorkspace,
  stopDaemon,
  warmDaemonWorkspace,
  type DaemonOutcome,
  type DaemonStatus,
  type DaemonWorkspaceStatus,
  type EnsureDaemonInput,
} from "./client.js";
export {
  DEFAULT_DAEMON_CONFIG,
  parseDaemonConfig,
  readDaemonConfig,
  type DaemonConfig,
} from "./config.js";
export {
  daemonConfigPath,
  daemonDir,
  daemonEnabled,
  daemonLogPath,
  daemonRecordPath,
} from "./paths.js";
export {
  isProcessAlive,
  readDaemonRecord,
  type DaemonRecord,
} from "./record.js";
export {
  parsePmset,
  parseSysfs,
  shouldPauseForBattery,
  type BatteryState,
} from "./battery.js";
