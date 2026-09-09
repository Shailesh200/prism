import { describe, expect, it } from "vitest";
import type { JobSummary } from "@repo-prism/app-shell";
import { formatJobLogsMarkdown, jobLogsFilename } from "./job-export.js";

const job = (
  patch: Partial<JobSummary> & Pick<JobSummary, "id" | "status">,
): JobSummary => ({
  title: patch.title ?? patch.id,
  branch: "",
  workspacePath: "/prism",
  workspaceLabel: "prism",
  ...patch,
});

describe("jobLogsFilename", () => {
  it("slugs the title", () => {
    expect(jobLogsFilename("Fix auth timeout")).toBe(
      "fix-auth-timeout-logs.md",
    );
  });
});

describe("formatJobLogsMarkdown", () => {
  it("writes status, tokens, brief, and console lines", () => {
    const md = formatJobLogsMarkdown(
      job({
        id: "j1",
        status: "cancelled",
        title: "Wire pulse clocks",
        createdAt: "2026-09-09T10:00:00.000Z",
        startedAt: "2026-09-09T10:01:00.000Z",
        prd: "Fix the waiting clock.",
        tokenUsage: {
          inputTokens: 180_000,
          outputTokens: 2_000,
          contextTokens: 167_000,
          contextWindow: 200_000,
        },
      }),
      {
        totalCount: 3,
        truncated: true,
        entries: [
          {
            ts: "2026-09-09T10:01:01.000Z",
            phase: "thinking",
            text: "Looking at pulse-view.",
            level: "info",
          },
          {
            ts: "2026-09-09T10:01:08.000Z",
            phase: "tool",
            tool: "grep",
            text: "waitedWorkedLabel",
            level: "info",
          },
        ],
      },
    );
    expect(md).toContain("# Wire pulse clocks");
    expect(md).toContain("Status: cancelled");
    expect(md).toContain("Latest 2 of 3 console lines.");
    expect(md).toContain("## Brief");
    expect(md).toContain("Fix the waiting clock.");
    expect(md).toContain("thinking");
    expect(md).toContain("Looking at pulse-view.");
    expect(md).toContain("grep");
    expect(md).toMatch(/Tokens: .*in 180k/);
  });

  it("notes an empty console", () => {
    const md = formatJobLogsMarkdown(job({ id: "empty", status: "queued" }), {
      entries: [],
      totalCount: 0,
      truncated: false,
    });
    expect(md).toContain("No console lines yet.");
  });
});
