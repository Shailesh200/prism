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
import { prepareChange } from "./tools/prepare.js";
import { graph } from "./tools/graph.js";
import { guardSession } from "./tools/guard.js";
import { reviewWith } from "./tools/lenses.js";
import { agentsMd } from "./tools/agents-md.js";
import { listFindings } from "./tools/findings.js";
import { receipt } from "./tools/receipt.js";

export {
  DEFAULT_TOOL_NAMES,
  HERO_TOOL_NAMES,
  OPT_IN_TOOL_NAMES,
} from "@repo-prism/shared";
import { DEFAULT_TOOL_NAMES, OPT_IN_TOOL_NAMES } from "@repo-prism/shared";

export type ToolSelection = {
  readonly tools: readonly ToolDefinition<never>[];
  /** `extraTools[]` entries that name no opt-in tool (reported by `doctor`). */
  readonly unknownExtraTools: readonly string[];
};

/** The default nine plus any opt-in tools named in `extraTools`. */
export function selectTools(extraTools: readonly string[] = []): ToolSelection {
  const optIn = new Set<string>(OPT_IN_TOOL_NAMES);
  const visible = new Set<string>(DEFAULT_TOOL_NAMES);
  const unknownExtraTools: string[] = [];
  for (const name of extraTools) {
    if (optIn.has(name)) visible.add(name);
    else if (!visible.has(name)) unknownExtraTools.push(name);
  }
  return {
    tools: TOOLS.filter((tool) => visible.has(tool.name)),
    unknownExtraTools,
  };
}

export const TOOLS: readonly ToolDefinition<never>[] = [
  prepareChange,
  graph,
  guardSession,
  reviewWith,
  agentsMd,
  listFindings,
  receipt,
  ...ORIENTATION_TOOLS,
  ...GRAPH_TOOLS,
  ...IMPACT_TOOLS,
] as unknown as readonly ToolDefinition<never>[];

/** Every registered tool name: the default nine plus the opt-in tools. */
export const TOOL_NAMES: readonly string[] = TOOLS.map((tool) => tool.name);
