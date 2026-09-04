import { describe, expect, it } from "vitest";
import { findingWhenIso, findingsIndex } from "./findings.js";
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
