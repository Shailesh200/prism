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

export const TOOLS: readonly ToolDefinition<never>[] = [
  ...ORIENTATION_TOOLS,
  ...GRAPH_TOOLS,
  ...IMPACT_TOOLS,
  ...REPORT_TOOLS,
] as unknown as readonly ToolDefinition<never>[];

/** Names only, for documentation and contract tests. */
export const TOOL_NAMES: readonly string[] = TOOLS.map((tool) => tool.name);
