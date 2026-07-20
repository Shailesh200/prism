/**
 * Stable machine-readable error codes for Core / MCP / CLI.
 * Documented in package README — do not rename without ADR.
 */
export const PrismErrorCode = {
  UNKNOWN: "PRISM_UNKNOWN",
  VALIDATION: "PRISM_VALIDATION",
  NOT_FOUND: "PRISM_NOT_FOUND",
  INVALID_PATH: "PRISM_INVALID_PATH",
  INVALID_ID: "PRISM_INVALID_ID",
  WORKSPACE_NOT_OPEN: "PRISM_WORKSPACE_NOT_OPEN",
  INDEX_REQUIRED: "PRISM_INDEX_REQUIRED",
  INDEX_FAILED: "PRISM_INDEX_FAILED",
  ANALYZER_FAILED: "PRISM_ANALYZER_FAILED",
  GRAPH_ERROR: "PRISM_GRAPH_ERROR",
  IO_ERROR: "PRISM_IO_ERROR",
  UNSUPPORTED: "PRISM_UNSUPPORTED",
  CANCELLED: "PRISM_CANCELLED",
} as const;

export type PrismErrorCode =
  (typeof PrismErrorCode)[keyof typeof PrismErrorCode];

/**
 * JSON-serializable error for surfaces (MCP/CLI/IDE).
 * No Node Error / stack required on the wire.
 */
export type PrismError = {
  readonly code: PrismErrorCode;
  readonly message: string;
  readonly details?: unknown;
};

export function prismError(
  code: PrismErrorCode,
  message: string,
  details?: unknown,
): PrismError {
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}

export function isPrismError(value: unknown): value is PrismError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === "string" && typeof v.message === "string";
}
