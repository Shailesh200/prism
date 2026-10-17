/**
 * The name Claude Code gives a Prism tool (round 4). `prism install` registers
 * the server as `prism`, so `prepare_change` is called as
 * `mcp__prism__prepare_change`. A nudge that says only "prepare_change" names
 * a tool the agent cannot see under that name while tool search defers it, so
 * every Claude-facing nudge uses the full id.
 */
export const PRISM_MCP_SERVER = "prism";

export function claudeToolId(tool: string): string {
  return `mcp__${PRISM_MCP_SERVER}__${tool}`;
}
