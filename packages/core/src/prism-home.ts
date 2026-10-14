/**
 * Per-repo Prism state lives under `~/.prism/workspaces/<key>/`.
 * Tests without `PRISM_HOME` still write `{repo}/.prism`.
 */

export {
  agentsMdPath,
  ensureWorkspacePrism,
  ensureWorkspacePrismSync,
  loadWorkspaceMemories,
  migrateWorkspaceMemories,
  prismHomeDir,
  useLocalPrismStore,
  workspaceCacheDir,
  workspaceConfigPath,
  workspaceDispatchDir,
  workspaceFindingMutesPath,
  workspaceKey,
  workspaceNotesDir,
  workspacePrismDir,
} from "@repo-prism/shared/prism-home";

export { workspacePrismDir as workspaceStateDir } from "@repo-prism/shared/prism-home";
