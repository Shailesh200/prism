import { describe, expect, it } from "vitest";
import { ok } from "@prism/shared";
import type { BackendReport } from "@prism/shared";
import {
  BACKEND_REPORT_TOOL,
  callBackendReportTool,
} from "./backend-report-tool.js";

describe("backend report MCP tool adapter", () => {
  it("exposes a tool descriptor and forwards to Core", async () => {
    expect(BACKEND_REPORT_TOOL.name).toBe("prism_backend_report");
    const sample = {
      rootPath: "/tmp",
      generatedAt: new Date().toISOString(),
      summary: "test",
      frameworksDetected: [],
      endpoints: [],
      dataLayer: [],
      envVars: [],
      integrations: [],
      background: [],
    } satisfies BackendReport;

    const result = await callBackendReportTool({
      getBackendReport: async () => ok(sample),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe("test");
  });
});
