/**
 * The tool pack (M-026 spine, filled out in M-027).
 *
 * Names are `snake_case` and unprefixed: MCP clients already namespace tools by
 * server, so `prism_repository_dna` reads as "prism prism repository dna" in
 * the places an agent actually sees it. M-026 shipped the prefixed spelling and
 * M-027 corrects it before anyone depends on it.
 *
 * Two capabilities from the Master Plan's table are deliberately absent:
 *
 * - `architecture_rules` — no rules engine exists. Building one is a product
 *   milestone, not an adapter task, so the tool is dropped rather than faked.
 * - `domain_report` — `getDomainReport` moved to M-053 with the rest of the
 *   presentation lift, so there is nothing to adapt yet.
 */

import type { ToolDefinition } from "./tool-registry.js";
import { GRAPH_TOOLS } from "./tools/graphs.js";
import { IMPACT_TOOLS } from "./tools/impact.js";
import { ORIENTATION_TOOLS } from "./tools/orientation.js";
import { REPORT_TOOLS } from "./tools/reports.js";
import { prepareChange } from "./tools/prepare.js";
import { workOrder } from "./tools/work-order.js";
import { graph } from "./tools/graph.js";
import { guardSession } from "./tools/guard.js";
import { lensTool, reviewWith } from "./tools/lenses.js";
import { agentsMd } from "./tools/agents-md.js";
import { listFindings } from "./tools/findings.js";

/** The tools the instructions teach first. */
export const HERO_TOOL_NAMES = [
  "prepare_change",
  "blast_radius",
  "guard_session",
] as const;

/**
 * Default `tools/list` (M-091, ADR-0064). The hero tools, plus the tools the
 * shipped skills, commands and prompts call. A test fails when one of those
 * names a tool that is not here. `PRISM_MCP_FULL=1` registers the rest.
 */
export const DEFAULT_TOOL_NAMES = [
  ...HERO_TOOL_NAMES,
  "test_impact",
  "repository_overview",
  "graph",
] as const;

export function visibleIntelligenceTools(
  env: NodeJS.ProcessEnv = process.env,
): readonly ToolDefinition<never>[] {
  if (env.PRISM_MCP_FULL === "1") return TOOLS;
  const visible = new Set<string>(DEFAULT_TOOL_NAMES);
  return TOOLS.filter((tool) => visible.has(tool.name));
}

export const TOOLS: readonly ToolDefinition<never>[] = [
  prepareChange,
  graph,
  workOrder,
  guardSession,
  reviewWith,
  lensTool,
  agentsMd,
  listFindings,
  ...ORIENTATION_TOOLS,
  ...GRAPH_TOOLS,
  ...IMPACT_TOOLS,
  ...REPORT_TOOLS,
] as unknown as readonly ToolDefinition<never>[];

/** Every tool `PRISM_MCP_FULL=1` registers. Prism has no Dispatch tools. */
export const TOOL_NAMES: readonly string[] = TOOLS.map((tool) => tool.name);
