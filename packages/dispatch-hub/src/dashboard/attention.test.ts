import { describe, expect, it } from "vitest";
import type { JobSummary } from "@repo-prism/app-shell";
import { attentionJobs } from "./attention.js";

const job = (
  patch: Partial<JobSummary> & Pick<JobSummary, "id" | "status">,
): JobSummary => ({
  title: patch.title ?? patch.id,
  branch: "",
  workspacePath: patch.workspacePath ?? "/prism",
  workspaceLabel: patch.workspaceLabel ?? "prism",
  createdAt: "2026-09-04T10:00:00.000Z",
  updatedAt: "2026-09-04T10:10:00.000Z",
  ...patch,
});

describe("attentionJobs", () => {
  it("keeps gates, stalled, paused, stuck, and review jobs", () => {
    const rows = attentionJobs([
      job({ id: "a", status: "needs_confirm" }),
      job({ id: "b", status: "waiting_on_you" }),
      job({ id: "c", status: "paused" }),
      job({ id: "d", status: "needs_review" }),
      job({ id: "stuck", status: "blocked" }),
      job({ id: "e", status: "running" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d", "stuck"]);
  });
});
