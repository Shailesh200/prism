/**
 * MCP tool adapter for BackendReport (M-044).
 * Full MCP server protocol lands in M-026; this handler is the Core-backed
 * contract surfaces will register.
 */
import type { BackendReport, PrismError, Result } from "@prism/shared";

export const BACKEND_REPORT_TOOL = {
  name: "prism_backend_report",
  description:
    "Return route-granular backend intelligence (endpoints, auth, data layer, env, background jobs) from local Core analysis.",
  inputSchema: {
    type: "object",
    properties: {
      packageId: {
        type: "string",
        description: "Optional package scope id within a monorepo",
      },
    },
  },
} as const;

export type BackendReportToolWorkspace = {
  getBackendReport(options?: {
    packageId?: string;
  }): Promise<Result<BackendReport, PrismError>>;
};

/** Invoke Core `getBackendReport` and return a JSON-serializable DTO. */
export async function callBackendReportTool(
  workspace: BackendReportToolWorkspace,
  args?: { packageId?: string },
): Promise<Result<BackendReport, PrismError>> {
  return workspace.getBackendReport(
    args?.packageId ? { packageId: args.packageId } : undefined,
  );
}
