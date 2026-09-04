// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobsScreen } from "./JobsScreen.js";
import { consoleNote } from "./JobConsole.js";
import {
  GATE_PATH_SAMPLE,
  gateOverflowNote,
  heartbeatAge,
  jobElapsed,
  jobsWaitingOnYou,
  jobStages,
  jobRailFill,
  jobReviewPending,
  formatWorkerModel,
  jobModelLabel,
  splitJobSummary,
  parseFabricationMention,
  notePathsFromText,
  jobTimeBreakdown,
  mergeConsoleEntries,
  newestEntryTs,
  orderJobsForBoard,
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
    { path: "src/new.ts", added: 4, removed: 0, change: "added" as const },
  ],
  totalAdded: 15,
  totalRemoved: 1,
  truncated: false,
  branch: "dispatch/rms-pagination",
  baseRef: "main",
  committed: true,
  merged: false as const,
};

function entry(text: string, ts: string): JobConsoleEntry {
  return { ts, phase: "tool", text, level: "info" };
}

function port(overrides: Partial<JobsPort> = {}): JobsPort {
  return {
    jobLogs: async (): Promise<JobConsolePage> => ({
      entries: [],
      totalCount: 0,
      truncated: false,
    }),
    ...overrides,
  };
}

/** The list is a prop now, so every render needs the controlled trio. */
function board(
  jobs: JobSummary[],
  overrides: Partial<JobsPort> = {},
): { jobs: JobSummary[]; loading: false; port: JobsPort } {
  return { jobs, loading: false, port: port(overrides) };
}

describe("JobsScreen", () => {
  it("shows a live job with its branch and elapsed time", async () => {
    const started = new Date(Date.now() - 64 * 60_000).toISOString();
    render(
      <JobsScreen
        repoLabel="arcana-platform-website"
        {...board([
          {
            id: "rms-pagination-100k-cap",
            title: "RMS pagination 100k+ cap",
            status: "running",
            branch: "dispatch/rms-pagination-100k-cap",
            startedAt: started,
            lastActivity: "Thinking",
          },
        ])}
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
        {...board(
          [
            {
              id: "job-1",
              title: "Fix pagination",
              status: "running",
              branch: "dispatch/job-1",
            },
          ],
          {
            jobLogs: async () => ({
              entries: [
                entry("Using grep", "2026-01-01T00:00:01.000Z"),
                entry("Editing table.ts", "2026-01-01T00:00:02.000Z"),
              ],
              totalCount: 2,
              truncated: false,
            }),
          },
        )}
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
        {...board([
          {
            id: "job-1",
            title: "Fix pagination",
            status: "needs_review",
            branch: "dispatch/job-1",
            review,
          },
        ])}
      />,
    );

    expect(await screen.findByText("Ready for review")).toBeTruthy();
    expect(screen.getByText("1 to review")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Fix pagination/ }));
    expect(await screen.findByText("src/table.ts")).toBeTruthy();
    expect(screen.getByText("added")).toBeTruthy();
    expect(
      screen.getByText(/Nothing has been merged into the branch you are on/i),
    ).toBeTruthy();
  });

  it("hides Ready for review when the job left no files", async () => {
    const user = userEvent.setup();
    render(
      <JobsScreen
        repoLabel="repo"
        {...board([
          {
            id: "job-1",
            title: "audit gsap components",
            status: "done",
            branch: "dispatch/job-1",
            resultSummary: "Done — no reviewable change.",
            workerBackend: "claude",
            workerModel: "claude-sonnet-4-5",
            review: {
              files: [],
              totalAdded: 0,
              totalRemoved: 0,
              truncated: false,
              committed: false,
              merged: false,
            },
          },
        ])}
      />,
    );

    expect(screen.queryByText("Ready for review")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /audit gsap components/ }),
    );
    expect(await screen.findByText("Job summary")).toBeTruthy();
    expect(
      screen.getAllByText("Done — no reviewable change.").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sonnet 4.5").length).toBeGreaterThan(0);
  });

  it("opens findings from a notes path and expands +N more", async () => {
    const user = userEvent.setup();
    const onOpenFindings = vi.fn();
    render(
      <JobsScreen
        repoLabel="repo"
        onOpenFindings={onOpenFindings}
        {...board([
          {
            id: "audit-gsap",
            title: "Audit GSAP",
            status: "done",
            branch: "dispatch/audit-gsap",
            resultSummary:
              "Produced no reviewable change. It mentioned lib/gsap.ts, src/a.ts (+2 more), which was not written. I wrote the findings to `.prism/dispatch/notes/audit-gsap-components.md`.",
            citedMissing: ["lib/gsap.ts", "src/a.ts", "src/b.ts", "src/c.ts"],
            workerBackend: "claude",
          },
        ])}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Audit GSAP/ }));
    expect(
      await screen.findByRole("button", {
        name: ".prism/dispatch/notes/audit-gsap-components.md",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open full findings" }),
    ).toBeTruthy();
    expect(screen.queryByText("packages/dispatch-hub")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: ".prism/dispatch/notes/audit-gsap-components.md",
      }),
    );
    expect(onOpenFindings).toHaveBeenCalledWith(
      expect.objectContaining({ id: "audit-gsap" }),
      ".prism/dispatch/notes/audit-gsap-components.md",
    );
    await user.click(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getByText("src/b.ts")).toBeTruthy();
    expect(screen.getByText("src/c.ts")).toBeTruthy();
  });

  it("offers Keep and Restore on a checkout review", async () => {
    const user = userEvent.setup();
    const control = vi.fn(async () => {});
    render(
      <JobsScreen
        repoLabel="repo"
        {...board(
          [
            {
              id: "job-1",
              title: "Fix pagination",
              status: "needs_review",
              branch: "main",
              placement: "checkout",
              review: { ...review, committed: false, branch: "main" },
            },
          ],
          { control },
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Fix pagination/ }));
    await user.click(await screen.findByRole("button", { name: "Keep all" }));
    await waitFor(() =>
      expect(control).toHaveBeenCalledWith("accept_all", "job-1"),
    );
    await user.click(screen.getAllByRole("button", { name: "Restore" })[0]!);
    await waitFor(() =>
      expect(control).toHaveBeenCalledWith("reject_file", "job-1", {
        path: "src/table.ts",
      }),
    );
  });

  it("warns that a stalled job has gone quiet", async () => {
    render(
      <JobsScreen
        repoLabel="repo"
        {...board([
          {
            id: "job-1",
            title: "Fix pagination",
            status: "waiting_on_you",
            branch: "dispatch/job-1",
            lastActivity: "No activity for 1h 4m",
          },
        ])}
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
        {...board(
          [
            {
              id: "job-1",
              title: "Fix pagination",
              status: "running",
              branch: "dispatch/job-1",
            },
          ],
          { control },
        )}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(control).toHaveBeenCalledWith("cancel", "job-1"),
    );
  });

  it("offers Delete on a finished job and removes it via the host", async () => {
    const user = userEvent.setup();
    const control = vi.fn(async () => {});
    render(
      <JobsScreen
        repoLabel="repo"
        {...board(
          [
            {
              id: "latency-check",
              title: "Latency check",
              status: "error",
              branch: "milestone/M-067-shippable-product",
              errorMessage: "Not logged in",
            },
          ],
          { control },
        )}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(control).toHaveBeenCalledWith("delete", "latency-check"),
    );
    expect(screen.queryByText("Latency check")).toBeNull();
  });

  it("filters the board by repository when more than one is present", async () => {
    const user = userEvent.setup();
    render(
      <JobsScreen
        repoLabel="all repos"
        workspaces={[
          { path: "/a", label: "alpha", jobCount: 1 },
          { path: "/b", label: "beta", jobCount: 1 },
        ]}
        {...board([
          {
            id: "one",
            title: "Alpha job",
            status: "done",
            branch: "main",
            workspacePath: "/a",
            workspaceLabel: "alpha",
          },
          {
            id: "two",
            title: "Beta job",
            status: "done",
            branch: "main",
            workspacePath: "/b",
            workspaceLabel: "beta",
          },
        ])}
      />,
    );
    expect(await screen.findByText("Alpha job")).toBeTruthy();
    expect(screen.getByText("Beta job")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "alpha repository" }));
    expect(screen.getByText("Alpha job")).toBeTruthy();
    expect(screen.queryByText("Beta job")).toBeNull();
  });

  it("shows a repository filter even when only one repo is registered", async () => {
    render(
      <JobsScreen
        repoLabel="prism"
        workspaces={[{ path: "/prism", label: "prism", jobCount: 1 }]}
        {...board([
          {
            id: "one",
            title: "Solo job",
            status: "done",
            branch: "main",
            workspacePath: "/prism",
            workspaceLabel: "prism",
          },
        ])}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "All repos" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "prism repository" }),
    ).toBeTruthy();
  });

  it("surfaces a list failure instead of rendering an empty board", async () => {
    render(
      <JobsScreen
        repoLabel="repo"
        {...board([])}
        listError="Dispatch is unreachable"
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Dispatch is unreachable",
    );
    expect(screen.queryByText("No jobs yet")).toBeNull();
  });

  it("invites a first job when there are none", async () => {
    render(<JobsScreen repoLabel="repo" {...board([])} />);
    expect(await screen.findByText("No jobs yet")).toBeTruthy();
  });

  // The bug this contract exists to kill: a board that has not been read yet
  // must not claim to be empty.
  it("shows a skeleton, not the empty copy, before the first read lands", () => {
    render(<JobsScreen repoLabel="repo" jobs={[]} loading port={port()} />);
    expect(screen.queryByText("No jobs yet")).toBeNull();
    expect(
      screen.getAllByRole("list").some((el) => el.ariaBusy === "true"),
    ).toBe(true);
  });

  it("renders the jobs its host hands it, with no fetch of its own", async () => {
    const { rerender } = render(
      <JobsScreen repoLabel="repo" jobs={[]} loading port={port()} />,
    );
    expect(screen.queryByText("Fix pagination")).toBeNull();

    rerender(
      <JobsScreen
        repoLabel="repo"
        {...board([
          {
            id: "job-1",
            title: "Fix pagination",
            status: "running",
            branch: "dispatch/job-1",
          },
        ])}
      />,
    );
    expect(await screen.findByText("Fix pagination")).toBeTruthy();
  });

  it("discloses console truncation instead of passing a partial log off as whole", async () => {
    const user = userEvent.setup();
    render(
      <JobsScreen
        repoLabel="repo"
        {...board(
          [
            {
              id: "job-1",
              title: "Fix pagination",
              status: "needs_review",
              branch: "dispatch/job-1",
            },
          ],
          {
            jobLogs: async () => ({
              entries: [entry("last line", "2026-01-01T00:00:09.000Z")],
              totalCount: 900,
              truncated: true,
            }),
          },
        )}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Fix pagination/ }));
    expect(
      await screen.findByText(/Showing the last 1 of 900 lines\./),
    ).toBeTruthy();
  });

  it("shows where the branch is checked out so a reviewer can go find it", async () => {
    const user = userEvent.setup();
    render(
      <JobsScreen
        repoLabel="repo"
        {...board([
          {
            id: "job-1",
            title: "Fix pagination",
            status: "needs_review",
            branch: "dispatch/job-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            worktreePath: "/repo/.prism/dispatch/worktrees/job-1",
            placement: "worktree",
          },
        ])}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Fix pagination/ }));
    expect(
      await screen.findByText("/repo/.prism/dispatch/worktrees/job-1"),
    ).toBeTruthy();
  });

  it("says plainly when a job edited the user's own working tree", async () => {
    const user = userEvent.setup();
    render(
      <JobsScreen
        repoLabel="repo"
        {...board([
          {
            id: "job-1",
            title: "Fix pagination",
            status: "needs_review",
            branch: "main",
            createdAt: "2026-01-01T00:00:00.000Z",
            worktreePath: "/repo",
            placement: "checkout",
          },
        ])}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Fix pagination/ }));
    expect(await screen.findByText(/Edited your working tree at/)).toBeTruthy();
  });

  it("asks its host to re-read rather than fetching the list itself", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <JobsScreen repoLabel="repo" {...board([])} onRefresh={onRefresh} />,
    );
    await user.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
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
    const at = (startedAt: string | undefined) => ({ startedAt });
    expect(jobElapsed(at("2026-01-01T01:59:56.000Z"), now)).toBe("4s");
    expect(jobElapsed(at("2026-01-01T01:48:00.000Z"), now)).toBe("12m");
    expect(jobElapsed(at("2026-01-01T00:56:00.000Z"), now)).toBe("1h 4m");
    expect(jobElapsed(at(undefined), now)).toBe("");
    expect(jobElapsed(at("not-a-date"), now)).toBe("");
  });

  it("freezes a finished job and splits its waiting from its working", () => {
    const later = Date.parse("2026-01-01T09:00:00.000Z");
    const job = {
      createdAt: "2026-01-01T00:00:00.000Z",
      queuedAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:09:00.000Z",
      finishedAt: "2026-01-01T00:12:00.000Z",
    };
    // Nine hours after it ended, the number is still what it was.
    expect(jobElapsed(job, later)).toBe("3m");
    expect(jobTimeBreakdown(job, later)).toBe("waited 9m · worked 3m");
  });

  it("reports how long since the worker last said anything", () => {
    const now = Date.parse("2026-01-01T00:01:00.000Z");
    expect(
      heartbeatAge({ lastHeartbeat: "2026-01-01T00:00:52.000Z" }, now),
    ).toBe("8s ago");
    // No heartbeat means unknown, not "just now".
    expect(heartbeatAge({}, now)).toBeUndefined();
    expect(heartbeatAge({ lastHeartbeat: "nonsense" }, now)).toBeUndefined();
  });

  it("states console truncation and filtering as separate facts", () => {
    const page = (n: number, totalCount: number, truncated: boolean) => ({
      entries: Array.from({ length: n }, () => ({})),
      totalCount,
      truncated,
    });
    expect(consoleNote(page(200, 900, true), 200, false)).toBe(
      "Showing the last 200 of 900 lines.",
    );
    expect(consoleNote(page(200, 900, true), 12, true)).toBe(
      "Showing the last 200 of 900 lines. 12 of 200 match this filter.",
    );
    // Nothing hidden, nothing to say.
    expect(consoleNote(page(5, 5, false), 5, false)).toBeUndefined();
    expect(consoleNote(page(5, 5, false), 5, true)).toBeUndefined();
  });

  it("summarises review totals", () => {
    expect(reviewFileTotals(review)).toBe("2 files · +15 -1");
    expect(reviewFileTotals({ ...review, truncated: true })).toBe(
      "2+ files · +15 -1",
    );
  });
});

describe("the dirty-checkout gate", () => {
  const dirty = Array.from({ length: 217 }, (_, i) => `src/file-${i}.ts`);

  it("lists a sample and counts the rest rather than dumping the tree", async () => {
    render(
      <JobsScreen
        repoLabel="prism"
        {...board([
          {
            id: "ship-gate-smoke",
            title: "Ship gate smoke",
            status: "needs_confirm",
            branch: "",
            createdAt: new Date().toISOString(),
            confirm: {
              kind: "dirty-checkout",
              question: "Your working tree has uncommitted changes.",
              dirtyPaths: dirty,
            },
          },
        ])}
      />,
    );
    await screen.findAllByText("Ship gate smoke");
    // A repo mid-refactor must not turn one card into a 217-row scroll.
    expect(screen.getByText("src/file-0.ts")).toBeTruthy();
    expect(screen.queryByText("src/file-100.ts")).toBeNull();
    expect(screen.getByText("and 209 more files.")).toBeTruthy();
  });

  it("says nothing extra when every path already fits", () => {
    expect(gateOverflowNote(GATE_PATH_SAMPLE + 1)).toBe("and 1 more file.");
  });

  it("pins a waiting-on-you banner above the board", async () => {
    render(
      <JobsScreen
        repoLabel="prism"
        {...board([
          {
            id: "done-job",
            title: "Finished audit",
            status: "done",
            branch: "dispatch/done",
            createdAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:01:00.000Z",
          },
          {
            id: "latency-check",
            title: "Latency check",
            status: "needs_confirm",
            branch: "",
            createdAt: "2026-01-01T00:02:00.000Z",
            confirm: {
              kind: "dirty-checkout",
              question: "Your working tree has uncommitted changes.",
            },
          },
        ])}
      />,
    );
    expect(await screen.findByText("1 job needs your OK")).toBeTruthy();
    expect(screen.getByText("1 need your OK")).toBeTruthy();
    // Approvals sort above finished work so they cannot hide under history.
    const jobTitles = Array.from(
      document.querySelectorAll(".job-card__title"),
    ).map((el) => el.textContent);
    expect(jobTitles[0]).toBe("Latency check");
    expect(jobTitles[1]).toBe("Finished audit");
  });

  it("orders approvals ahead of finished jobs", () => {
    const ordered = orderJobsForBoard([
      {
        id: "a",
        title: "A",
        status: "done",
        branch: "b",
        updatedAt: "2026-01-01T00:02:00.000Z",
      },
      {
        id: "b",
        title: "B",
        status: "needs_confirm",
        branch: "",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    expect(ordered.map((job) => job.id)).toEqual(["b", "a"]);
    expect(jobsWaitingOnYou(ordered)).toHaveLength(1);
  });

  it("keeps history in trigger order after a later Keep", () => {
    const ordered = orderJobsForBoard([
      {
        id: "older",
        title: "Older",
        status: "done",
        branch: "b",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:20:00.000Z",
      },
      {
        id: "newer",
        title: "Newer",
        status: "done",
        branch: "b",
        createdAt: "2026-01-01T00:05:00.000Z",
        updatedAt: "2026-01-01T00:06:00.000Z",
      },
    ]);
    expect(ordered.map((job) => job.id)).toEqual(["newer", "older"]);
  });
});

describe("job lifecycle rail", () => {
  const base = {
    id: "j1",
    title: "Paginate the table",
    branch: "dispatch/j1",
  } as const;

  it("marks the stage a running job is sitting on and counts it up", () => {
    const now = Date.parse("2026-01-01T00:12:00.000Z");
    const stages = jobStages(
      {
        ...base,
        status: "running",
        createdAt: "2026-01-01T00:00:00.000Z",
        queuedAt: "2026-01-01T00:00:02.000Z",
        startedAt: "2026-01-01T00:09:00.000Z",
      },
      now,
    );
    expect(stages.map((s) => [s.id, s.reached, s.current])).toEqual([
      ["created", true, false],
      ["queued", true, false],
      ["started", true, true],
      ["finished", false, false],
    ]);
    // Reached stages measure to the next stamp; the current one measures to now.
    expect(stages[1]!.span).toBe("8m 58s");
    expect(stages[2]!.span).toBe("3m");
  });

  it("names the last rung after the outcome rather than always 'Finished'", () => {
    const now = Date.parse("2026-01-01T01:00:00.000Z");
    const of = (status: JobSummary["status"]) =>
      jobStages(
        {
          ...base,
          status,
          createdAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:05:00.000Z",
        },
        now,
      ).at(-1)!;
    expect(of("done").label).toBe("Finished");
    expect(of("error").label).toBe("Failed");
    expect(of("cancelled").label).toBe("Cancelled");
    // Settled means no rung pulses, whatever the outcome was.
    expect(of("error").current).toBe(false);
  });

  it("does not leave a pre-P-S1 record pulsing forever", () => {
    // Terminal status, no finishedAt — the same shape that made a finished job
    // render as "17h 30m" before `endOfLifeFor` existed.
    const stages = jobStages(
      {
        ...base,
        status: "done",
        createdAt: "2026-01-01T00:00:00.000Z",
        startedAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      Date.parse("2026-01-02T00:00:00.000Z"),
    );
    expect(stages.some((s) => s.current)).toBe(false);
    expect(stages.at(-1)?.reached).toBe(true);
    expect(jobRailFill(stages)).toBe(1);
  });

  it("leaves a skipped stage unreached rather than inventing a time for it", () => {
    const stages = jobStages(
      {
        ...base,
        status: "needs_confirm",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      Date.parse("2026-01-01T00:00:30.000Z"),
    );
    expect(stages[1]!.reached).toBe(false);
    expect(stages[1]!.at).toBeUndefined();
    expect(stages[1]!.span).toBeUndefined();
    // Accepted is where it is stuck, so that is the rung that reads as current.
    expect(stages[0]!.current).toBe(true);
    expect(stages[0]!.span).toBe("30s");
  });

  it("fills skipped rungs on a settled job without inventing timestamps", () => {
    const stages = jobStages(
      {
        ...base,
        status: "done",
        createdAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:08:15.000Z",
      },
      Date.parse("2026-01-01T01:00:00.000Z"),
    );
    expect(stages.every((stage) => stage.reached)).toBe(true);
    expect(stages[1]!.at).toBeUndefined();
    expect(stages[2]!.at).toBeUndefined();
    expect(jobRailFill(stages)).toBe(1);
  });
});

describe("jobReviewPending", () => {
  it("clears once every file has been kept", () => {
    const job = {
      id: "j1",
      title: "Keep me",
      status: "needs_review" as const,
      branch: "main",
      review: {
        files: [
          {
            path: "src/a.ts",
            added: 1,
            removed: 0,
            change: "modified" as const,
          },
        ],
        totalAdded: 1,
        totalRemoved: 0,
        truncated: false,
        committed: false,
        merged: false as const,
        keptPaths: ["src/a.ts"],
      },
    };
    expect(jobReviewPending(job)).toBe(false);
    expect(
      jobReviewPending({
        ...job,
        review: { ...job.review, keptPaths: [] },
      }),
    ).toBe(true);
  });

  it("is not pending when a needs_review job has no files", () => {
    expect(
      jobReviewPending({
        status: "needs_review",
        review: {
          files: [],
          totalAdded: 0,
          totalRemoved: 0,
          truncated: false,
          committed: false,
          merged: false,
        },
      }),
    ).toBe(false);
  });
});

describe("formatWorkerModel", () => {
  it("names the Claude family people actually say", () => {
    expect(formatWorkerModel("claude-sonnet-4-20250514")).toBe("Sonnet 4");
    expect(formatWorkerModel("claude-sonnet-4-5")).toBe("Sonnet 4.5");
    expect(formatWorkerModel("claude-3-5-sonnet-20241022")).toBe("Sonnet 3.5");
    expect(formatWorkerModel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(formatWorkerModel("claude-opus-4-1")).toBe("Opus 4.1");
    expect(formatWorkerModel("auto")).toBe("Auto");
  });

  it("keeps a third-party id readable without inventing a Claude name", () => {
    expect(formatWorkerModel("qwen2.5-coder")).toBe("Qwen");
    expect(formatWorkerModel("accounts/fireworks/models/llama-3-70b")).toBe(
      "Llama",
    );
    expect(formatWorkerModel("mystery-local-7b")).toBe("mystery-local-7b");
  });
});

describe("jobModelLabel thinking", () => {
  it("appends thinking when the worker reported it", () => {
    expect(jobModelLabel("claude", "claude-sonnet-4-5", "10000")).toBe(
      "Sonnet 4.5 · 10k thinking",
    );
    expect(jobModelLabel("claude", "claude-haiku-4-5", "adaptive")).toBe(
      "Haiku 4.5 · adaptive thinking",
    );
    expect(jobModelLabel("claude", "claude-opus-4-1", "disabled")).toBe(
      "Opus 4.1",
    );
  });
});

describe("splitJobSummary", () => {
  it("separates Prism wrap-up from the teammate's findings", () => {
    const parts = splitJobSummary(
      "Produced no reviewable change. This was a read-only audit — no source files were modified. I wrote the findings to `.prism/notes.md`. Summary of findings: **Repository:** `prism` - **apps/website** — marketing. Checks passed — typecheck and test passed. (your uncommitted changes were present)",
      true,
    );
    expect(parts.meta.join(" ")).toMatch(/Produced no reviewable change/);
    expect(parts.meta.join(" ")).toMatch(/read-only/);
    expect(parts.body).toMatch(/Summary of findings/);
    expect(parts.body).toMatch(/apps\/website/);
    expect(parts.body).not.toMatch(/Checks passed/);
    expect(parts.checks).toEqual([]);
  });

  it("extracts a notes path and a truncated mention", () => {
    expect(
      notePathsFromText(
        "I wrote the findings to `.prism/dispatch/notes/audit-gsap-components.md`.",
      ),
    ).toEqual([".prism/dispatch/notes/audit-gsap-components.md"]);
    expect(
      parseFabricationMention(
        "It mentioned github.com/x, lib/gsap.ts (+2 more), which was not written.",
      ),
    ).toEqual({
      shown: ["github.com/x", "lib/gsap.ts"],
      extra: 2,
    });
  });
});
