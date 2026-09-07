import { describe, expect, it } from "vitest";
import {
  findingWhenIso,
  findingsForRepo,
  findingsIndex,
  findingsInView,
  withSeedFinding,
} from "./findings.js";
import type { JobSummary } from "@repo-prism/app-shell";

const note = ".prism/dispatch/notes/a.md";

function job(
  partial: Partial<JobSummary> & Pick<JobSummary, "id">,
): JobSummary {
  return {
    title: partial.id,
    status: "done",
    branch: "b",
    notes: [note],
    ...partial,
  };
}

describe("findingsIndex", () => {
  it("drops jobs that never left a write-up", () => {
    expect(
      findingsIndex([
        job({ id: "with-notes" }),
        job({ id: "no-notes", notes: [] }),
      ]).map((row) => row.id),
    ).toEqual(["with-notes"]);
  });

  it("puts the latest triggered write-up first", () => {
    expect(
      findingsIndex([
        job({
          id: "older",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:20:00.000Z",
        }),
        job({
          id: "newer",
          createdAt: "2026-01-01T00:05:00.000Z",
          updatedAt: "2026-01-01T00:06:00.000Z",
        }),
      ]).map((row) => row.id),
    ).toEqual(["newer", "older"]);
  });
});

describe("findingsInView", () => {
  it("filters by search, repo, and time range", () => {
    const rows = [
      job({
        id: "prism-old",
        title: "Audit tests",
        workspacePath: "/prism",
        workspaceLabel: "Prism",
        finishedAt: "2026-01-01T00:00:00.000Z",
      }),
      job({
        id: "pilot-new",
        title: "Review the issues",
        workspacePath: "/pilot",
        workspaceLabel: "port-pilot",
        finishedAt: "2026-01-10T12:00:00.000Z",
      }),
    ];
    const now = Date.parse("2026-01-10T12:30:00.000Z");
    expect(
      findingsInView(rows, { filter: "audit", nowMs: now }).map(
        (row) => row.id,
      ),
    ).toEqual(["prism-old"]);
    expect(
      findingsInView(rows, { repo: "/pilot", nowMs: now }).map((row) => row.id),
    ).toEqual(["pilot-new"]);
    expect(
      findingsInView(rows, { range: "1h", nowMs: now }).map((row) => row.id),
    ).toEqual(["pilot-new"]);
  });
});

describe("findingsForRepo", () => {
  it("keeps write-ups for one checkout", () => {
    const rows = [
      job({
        id: "prism-note",
        workspacePath: "/prism",
        notes: [note],
      }),
      job({
        id: "other",
        workspacePath: "/other",
        notes: [note],
      }),
    ];
    expect(findingsForRepo(rows, "/prism").map((row) => row.id)).toEqual([
      "prism-note",
    ]);
    expect(findingsForRepo(rows, "")).toEqual([]);
  });

  it("applies range and search filters for one checkout", () => {
    const rows = [
      job({
        id: "old",
        title: "Audit tests",
        workspacePath: "/prism",
        finishedAt: "2026-01-01T00:00:00.000Z",
      }),
      job({
        id: "new",
        title: "Review auth",
        workspacePath: "/prism",
        finishedAt: "2026-01-10T12:00:00.000Z",
      }),
    ];
    const nowMs = Date.parse("2026-01-10T12:30:00.000Z");
    expect(
      findingsForRepo(rows, "/prism", { range: "1h", nowMs }).map(
        (row) => row.id,
      ),
    ).toEqual(["new"]);
    expect(
      findingsForRepo(rows, "/prism", { filter: "audit", nowMs }).map(
        (row) => row.id,
      ),
    ).toEqual(["old"]);
  });
});

describe("findingWhenIso", () => {
  it("prefers finished, then started, then accepted", () => {
    expect(
      findingWhenIso({
        finishedAt: "2026-01-01T00:10:00.000Z",
        startedAt: "2026-01-01T00:01:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("2026-01-01T00:10:00.000Z");
    expect(
      findingWhenIso({
        startedAt: "2026-01-01T00:01:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("2026-01-01T00:01:00.000Z");
    expect(findingWhenIso({ createdAt: "2026-01-01T00:00:00.000Z" })).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});

describe("withSeedFinding", () => {
  it("keeps a job in the picker even when it left no write-up", () => {
    const listed = [
      job({
        id: "noted",
        workspacePath: "/prism",
        notes: [note],
      }),
    ];
    const seed = job({
      id: "bare",
      workspacePath: "/prism",
      notes: [],
    });
    expect(withSeedFinding(listed, seed).map((row) => row.id)).toEqual([
      "bare",
      "noted",
    ]);
    expect(withSeedFinding(listed, listed[0]).map((row) => row.id)).toEqual([
      "noted",
    ]);
  });
});
