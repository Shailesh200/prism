// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobsScreen } from "./JobsScreen.js";
import {
  formatElapsed,
  mergeConsoleEntries,
  newestEntryTs,
  reviewFileTotals,
  type JobConsoleEntry,
  type JobConsolePage,
  type JobSummary,
  type JobsPort,
} from "./jobs-types.js";

afterEach(cleanup);

const review = {
  files: [
    {
      path: "src/table.ts",
      added: 11,
      removed: 1,
      change: "modified" as const,
    },
    { path: "src/new.ts", added: 4, removed: 0, change: "untracked" as const },
  ],
  totalAdded: 15,
  totalRemoved: 1,
  truncated: false,
  committed: false as const,
};

function entry(text: string, ts: string): JobConsoleEntry {
  return { ts, phase: "tool", text, level: "info" };
}

function port(overrides: Partial<JobsPort> & { jobs: JobSummary[] }): JobsPort {
  return {
    listJobs: async () => overrides.jobs,
    jobLogs: async (): Promise<JobConsolePage> => ({
      entries: [],
      totalCount: 0,
      truncated: false,
    }),
    ...overrides,
  };
}

describe("JobsScreen", () => {
  it("shows a live job with its branch and elapsed time", async () => {
    const started = new Date(Date.now() - 64 * 60_000).toISOString();
    render(
      <JobsScreen
        repoLabel="arcana-platform-website"
        port={port({
          jobs: [
            {
              id: "rms-pagination-100k-cap",
              title: "RMS pagination 100k+ cap",
              status: "running",
              branch: "dispatch/rms-pagination-100k-cap",
              startedAt: started,
              lastActivity: "Thinking",
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText("RMS pagination 100k+ cap")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("1 live")).toBeTruthy();
    expect(screen.getByText("1h 4m")).toBeTruthy();
    expect(screen.getByText("dispatch/rms-pagination-100k-cap")).toBeTruthy();
  });

  it("opens a console and shows the tailed lines", async () => {
    const user = userEvent.setup();
    render(
      <JobsScreen
        repoLabel="repo"
        port={port({
          jobs: [
            {
              id: "job-1",
              title: "Fix pagination",
              status: "running",
              branch: "dispatch/job-1",
            },
          ],
          jobLogs: async () => ({
            entries: [
              entry("Using grep", "2026-01-01T00:00:01.000Z"),
              entry("Editing table.ts", "2026-01-01T00:00:02.000Z"),
            ],
            totalCount: 2,
            truncated: false,
          }),
        })}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: /Fix pagination/ }),
    );
    expect(await screen.findByText("Using grep")).toBeTruthy();
    expect(screen.getByText("Editing table.ts")).toBeTruthy();
  });

  it("presents the uncommitted review and says nothing was committed", async () => {
    const user = userEvent.setup();
    render(
      <JobsScreen
        repoLabel="repo"
        port={port({
          jobs: [
            {
              id: "job-1",
              title: "Fix pagination",
              status: "needs_review",
              branch: "dispatch/job-1",
              review,
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText("Ready for review")).toBeTruthy();
    expect(screen.getByText("1 to review")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Fix pagination/ }));
    expect(await screen.findByText("src/table.ts")).toBeTruthy();
    expect(screen.getByText("untracked")).toBeTruthy();
    expect(screen.getByText(/Nothing was committed/i)).toBeTruthy();
  });

  it("warns that a stalled job has gone quiet", async () => {
    render(
      <JobsScreen
        repoLabel="repo"
        port={port({
          jobs: [
            {
              id: "job-1",
              title: "Fix pagination",
              status: "waiting_on_you",
              branch: "dispatch/job-1",
              lastActivity: "No activity for 1h 4m",
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText("Needs you")).toBeTruthy();
    expect(screen.getByText(/No recent output/i)).toBeTruthy();
    expect(screen.getByText("No activity for 1h 4m")).toBeTruthy();
  });

  it("passes a control action to the host", async () => {
    const user = userEvent.setup();
    const control = vi.fn(async () => {});
    render(
      <JobsScreen
        repoLabel="repo"
        port={port({
          jobs: [
            {
              id: "job-1",
              title: "Fix pagination",
              status: "running",
              branch: "dispatch/job-1",
            },
          ],
          control,
        })}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(control).toHaveBeenCalledWith("cancel", "job-1"),
    );
  });

  it("surfaces a list failure instead of rendering an empty board", async () => {
    render(
      <JobsScreen
        repoLabel="repo"
        port={{
          listJobs: async () => {
            throw new Error("Dispatch is unreachable");
          },
          jobLogs: async () => ({
            entries: [],
            totalCount: 0,
            truncated: false,
          }),
        }}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Dispatch is unreachable",
    );
  });

  it("invites a first job when there are none", async () => {
    render(<JobsScreen repoLabel="repo" port={port({ jobs: [] })} />);
    expect(await screen.findByText("No jobs yet")).toBeTruthy();
  });
});

describe("console tailing helpers", () => {
  it("appends new lines and drops duplicates a re-poll returns", () => {
    const first = [entry("a", "2026-01-01T00:00:01.000Z")];
    const merged = mergeConsoleEntries(first, [
      entry("a", "2026-01-01T00:00:01.000Z"),
      entry("b", "2026-01-01T00:00:02.000Z"),
    ]);
    expect(merged.map((row) => row.text)).toEqual(["a", "b"]);
  });

  it("caps the buffer so a long job cannot grow the DOM forever", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      entry(`line ${i}`, `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`),
    );
    const merged = mergeConsoleEntries([], many, 10);
    expect(merged).toHaveLength(10);
    expect(merged[0]!.text).toBe("line 20");
  });

  it("reports the newest timestamp for the next poll", () => {
    expect(newestEntryTs([])).toBeUndefined();
    expect(
      newestEntryTs([
        entry("a", "2026-01-01T00:00:01.000Z"),
        entry("b", "2026-01-01T00:00:09.000Z"),
      ]),
    ).toBe("2026-01-01T00:00:09.000Z");
  });

  it("formats elapsed time the way the card reads it", () => {
    const now = Date.parse("2026-01-01T02:00:00.000Z");
    expect(formatElapsed("2026-01-01T01:59:56.000Z", now)).toBe("4s");
    expect(formatElapsed("2026-01-01T01:48:00.000Z", now)).toBe("12m");
    expect(formatElapsed("2026-01-01T00:56:00.000Z", now)).toBe("1h 4m");
    expect(formatElapsed(undefined, now)).toBe("");
    expect(formatElapsed("not-a-date", now)).toBe("");
  });

  it("summarises review totals", () => {
    expect(reviewFileTotals(review)).toBe("2 files · +15 -1");
    expect(reviewFileTotals({ ...review, truncated: true })).toBe(
      "2+ files · +15 -1",
    );
  });
});
