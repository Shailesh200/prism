/**
 * The MCP tool names (plan §0.3), in one place so the server, `prism doctor
 * skills` and the contract tests read the same list.
 */

/** The tools the instructions teach first. */
export const HERO_TOOL_NAMES = [
  "prepare_change",
  "blast_radius",
  "guard_session",
] as const;

/**
 * Every tool an agent sees. A shipped skill, command, prompt, hook or
 * instruction may name any of them (`skills-tools` contract test).
 */
export const DEFAULT_TOOL_NAMES = [
  ...HERO_TOOL_NAMES,
  "test_impact",
  "habits",
  "safe_delete",
  "rename_impact",
  "repository_overview",
  "graph",
  "dependency_graph",
  "knowledge_graph",
  "dependency_cycles",
  "list_packages",
  "explain_area",
  "explore_code",
  "list_findings",
  "agents_md",
  "workspace_status",
  "capabilities",
  "review_with",
  "receipt",
] as const;

/**
 * Kept so older `extraTools` entries still name a real tool. They are already
 * on; naming one does not add or remove it.
 */
export const OPT_IN_TOOL_NAMES = [] as const;
