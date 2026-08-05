/**
 * `PrismError` → MCP error mapping (M-026).
 *
 * Agents branch on codes and show prose to humans, so both have to survive the
 * trip. MCP's own error space is JSON-RPC's, which is far narrower than Prism's,
 * so the Prism code is preserved in the message rather than being flattened away.
 */

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { PrismErrorCode, type PrismError } from "@repo-prism/shared";

/**
 * Which JSON-RPC code an agent should see for each Prism failure.
 *
 * `InvalidParams` means "you asked wrongly, asking again the same way will fail
 * again"; `InternalError` means "we failed, retrying is not unreasonable". That
 * distinction is the only thing a well-written agent can act on automatically,
 * which is why the table exists rather than defaulting everything to internal.
 */
const JSON_RPC_CODE: Record<PrismErrorCode, ErrorCode> = {
  [PrismErrorCode.UNKNOWN]: ErrorCode.InternalError,
  [PrismErrorCode.VALIDATION]: ErrorCode.InvalidParams,
  [PrismErrorCode.NOT_FOUND]: ErrorCode.InvalidParams,
  [PrismErrorCode.INVALID_PATH]: ErrorCode.InvalidParams,
  [PrismErrorCode.INVALID_ID]: ErrorCode.InvalidParams,
  [PrismErrorCode.WORKSPACE_NOT_OPEN]: ErrorCode.InternalError,
  [PrismErrorCode.INDEX_REQUIRED]: ErrorCode.InternalError,
  [PrismErrorCode.INDEX_FAILED]: ErrorCode.InternalError,
  [PrismErrorCode.ANALYZER_FAILED]: ErrorCode.InternalError,
  [PrismErrorCode.GRAPH_ERROR]: ErrorCode.InternalError,
  [PrismErrorCode.IO_ERROR]: ErrorCode.InternalError,
  [PrismErrorCode.UNSUPPORTED]: ErrorCode.InvalidRequest,
  [PrismErrorCode.CANCELLED]: ErrorCode.InternalError,
};

/** Map a Core failure onto the MCP wire, keeping the Prism code readable. */
export function toMcpError(error: PrismError): McpError {
  const code = JSON_RPC_CODE[error.code] ?? ErrorCode.InternalError;
  return new McpError(code, `${error.code}: ${error.message}`, error.details);
}

/**
 * Wrap a thrown value. Core returns `Result` rather than throwing, so anything
 * arriving here is a bug or a native-module failure — either way the agent
 * should see something honest rather than a stack trace.
 */
export function toMcpErrorFromThrown(cause: unknown): McpError {
  if (cause instanceof McpError) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  return new McpError(
    ErrorCode.InternalError,
    `${PrismErrorCode.UNKNOWN}: ${message}`,
  );
}
