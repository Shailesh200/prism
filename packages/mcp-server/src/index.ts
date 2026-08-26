/** @repo-prism/mcp-server — MCP server over `@repo-prism/core` (M-026). */
export const PACKAGE_NAME = "@repo-prism/mcp-server" as const;

export {
  createPrismMcpServer,
  resolveWorkspaceFromProcess,
  startStdioServer,
  SERVER_NAME,
  type CreateServerOptions,
  type PrismMcpServer,
} from "./server.js";
export { TOOLS, TOOL_NAMES } from "./tools.js";
export { DISPATCH_TOOLS, DISPATCH_TOOL_NAMES } from "./dispatch-registry.js";
export {
  SERVER_INSTRUCTIONS,
  PROMPT_NAMES,
  type PromptName,
} from "./instructions.js";
export { registerPrompts } from "./prompts.js";
export { createIndexProgressReporter } from "./index-progress.js";
export {
  defineTool,
  registerTools,
  type ToolContext,
  type ToolDefinition,
} from "./tool-registry.js";
export {
  boundList,
  clampLimit,
  limitInput,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type BoundedList,
} from "./limits.js";
export { allWorkspaceRelative, toWorkspaceRelative } from "./paths.js";
export {
  createWorkspaceSession,
  type SessionOptions,
  type WorkspaceSession,
} from "./session.js";
export { toMcpError, toMcpErrorFromThrown } from "./errors.js";
export {
  resolveWorkspacePath,
  workspaceArgFrom,
  type ResolvedWorkspace,
  type WorkspaceSource,
} from "./workspace-resolution.js";
