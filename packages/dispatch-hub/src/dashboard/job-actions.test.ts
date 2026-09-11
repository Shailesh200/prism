import { describe, expect, it } from "vitest";
import type { JobSummary } from "@repo-prism/app-shell";
import {
  focusBarMeta,
  jobActionHandlers,
  jobActionItems,
  SKILL_GENERATE_BAR_IDS,
} from "./job-actions.js";

const job = (
  patch: Partial<JobSummary> & Pick<JobSummary, "id" | "status">,
): JobSummary => ({
  title: patch.title ?? patch.id,
  branch: "",
  workspacePath: "/prism",
  workspaceLabel: "prism",
  ...patch,
});

describe("jobActionItems", () => {
  it("always offers Copy job link when a job is present", () => {
    for (const status of [
      "running",
      "booting",
      "queued",
      "error",
      "done",
      "paused",
      "cancelled",
      "needs_confirm",
    ] as const) {
      const ids = jobActionItems({ job: job({ id: status, status }) }).map(
        (item) => item.id,
      );
      expect(ids, status).toContain("copy-link");
      expect(ids, status).toContain("export-logs");
    }
  });

  it("offers Resume after an unexpected stop", () => {
    const ids = jobActionItems({
      job: job({ id: "stopped", status: "error" }),
      onResume: () => undefined,
    }).map((item) => item.id);
    expect(ids).toContain("resume");
    expect(ids).toContain("copy-link");
  });

  it("offers Resume when a job is stuck", () => {
    const ids = jobActionItems({
      job: job({ id: "stuck", status: "blocked" }),
      onResume: () => undefined,
      onCancel: () => undefined,
    }).map((item) => item.id);
    expect(ids).toContain("resume");
    expect(ids).toContain("cancel");
  });

  it("offers Keep all while files are waiting for review", () => {
    const ids = jobActionItems({
      job: job({
        id: "review",
        status: "needs_review",
        review: {
          files: [
            {
              path: "src/a.ts",
              added: 1,
              removed: 0,
              change: "modified",
            },
          ],
          totalAdded: 1,
          totalRemoved: 0,
          truncated: false,
          committed: false,
          merged: false,
          keptPaths: [],
        },
      }),
      onKeepAll: () => undefined,
    }).map((item) => item.id);
    expect(ids).toContain("keep-all");
  });

  it("keeps retry and reverify on Failed jobs", () => {
    const ids = jobActionItems({
      job: job({
        id: "failed",
        status: "error",
        createdAt: "2026-09-07T02:00:00.000Z",
      }),
      onRetry: () => undefined,
      onReverify: () => undefined,
    }).map((item) => item.id);
    expect(ids).toContain("retry");
    expect(ids).toContain("reverify");
    expect(ids).toContain("copy-link");
  });

  it("offers instruct on a live run and start-from on a settled job", () => {
    expect(
      jobActionItems({
        job: job({ id: "live", status: "running" }),
        onAddInstruction: () => undefined,
        onPause: () => undefined,
        onCancel: () => undefined,
      }).map((item) => item.id),
    ).toEqual(
      expect.arrayContaining(["instruct", "pause", "cancel", "copy-link"]),
    );
    expect(
      jobActionItems({
        job: job({ id: "done", status: "done" }),
        onStartFromJob: () => undefined,
        onDelete: () => undefined,
        onOpenJob: () => undefined,
      }).map((item) => item.id),
    ).toEqual(
      expect.arrayContaining(["details", "start-from", "delete", "copy-link"]),
    );
  });

  it("does not delete a live job or a gate", () => {
    expect(
      jobActionItems({
        job: job({ id: "run", status: "running" }),
        onDelete: () => undefined,
      }).map((item) => item.id),
    ).not.toContain("delete");
    const gate = jobActionItems({
      job: job({ id: "gate", status: "needs_confirm" }),
      onDelete: () => undefined,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }).map((item) => item.id);
    expect(gate).toContain("confirm");
    expect(gate).toContain("cancel");
    expect(gate).not.toContain("delete");
  });

  it("returns no items without a job or repo action", () => {
    expect(jobActionItems({})).toEqual([]);
  });
});

describe("jobActionHandlers", () => {
  it("copies only the handlers that were passed", () => {
    const onRetry = (): void => undefined;
    const copied = jobActionHandlers({
      onRetry,
      pending: { jobId: "a", action: "retry" },
    });
    expect(copied.onRetry).toBe(onRetry);
    expect(copied.onPause).toBeUndefined();
    expect(copied.pending?.jobId).toBe("a");
  });
});

describe("focusBarMeta", () => {
  it("names Focus actions without dumping the ⋯ labels", () => {
    expect(focusBarMeta("copy-link", "Copy job link")).toMatchObject({
      label: "Copy",
      variant: "tertiary",
    });
    expect(focusBarMeta("retry", "Retry job").label).toBe("Job");
    expect(focusBarMeta("delete", "Delete").variant).toBe("danger");
    expect(focusBarMeta("resume", "Resume").variant).toBe("primary");
    expect(focusBarMeta("keep-all", "Keep all")).toMatchObject({
      label: "Keep all",
      variant: "primary",
    });
  });
});

describe("SKILL_GENERATE_BAR_IDS", () => {
  it("keeps Resume, Pause, Cancel, and Retry on the chip", () => {
    expect([...SKILL_GENERATE_BAR_IDS]).toEqual([
      "resume",
      "pause",
      "cancel",
      "retry",
    ]);
    const ids = jobActionItems({
      job: job({ id: "live", status: "running" }),
      onPause: () => undefined,
      onCancel: () => undefined,
    }).filter((item) => SKILL_GENERATE_BAR_IDS.has(item.id));
    expect(ids.map((item) => item.id)).toEqual(["pause", "cancel"]);
  });
});
