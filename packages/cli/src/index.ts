/** @repo-prism/cli — the `prism` command line over Core (M-028). */
export const PACKAGE_NAME = "@repo-prism/cli" as const;

export { CLI_NAME, main, run } from "./program.js";
export { COMMANDS, COMMANDS_BY_NAME } from "./commands.js";
export {
  COMMAND_GROUPS,
  type ArgumentSpec,
  type CommandGroup,
  type CommandSpec,
  type OptionSpec,
} from "./registry.js";
export { ExitCode, exitCodeForError } from "./exit.js";
export {
  bufferWriter,
  processWriter,
  renderJson,
  shouldUseColor,
  stripAnsi,
  type JsonEnvelope,
  type OutputOptions,
  type Writer,
} from "./output.js";
export {
  runCommand,
  type CommandContext,
  type CommandHandler,
  type CommandOutcome,
  type GlobalOptions,
  type RunOptions,
} from "./runtime.js";
export {
  findGitRoot,
  resolveWorkspace,
  type ResolvedWorkspace,
  type WorkspaceSource,
} from "./workspace.js";
