import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LastPrepareSummary } from "./prepare-dto.js";
import { PrepareRunRow } from "./prepare-history.js";

const run: LastPrepareSummary = {
  workspace: "/repo",
  task: "add hover focus to git graph dots",
  generatedAt: "2026-09-22T10:42:00.000Z",
  packFiles: [
    {
      path: "a.ts",
      symbols: [],
      why: [],
      tokenWeight: 1,
      provenance: "measured",
    },
  ],
  reuse: [],
  conventions: [
    {
      path: "b.ts",
      patternId: "route-handler",
      whyCanonical: "x",
    },
  ],
  ambiguous: null,
  truncated: false,
  totalCount: 1,
};

describe("PrepareRunRow", () => {
  it("renders the task, date, and count pills — not a Job title label", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<PrepareRunRow run={run} onOpen={onOpen} />);

    expect(screen.queryByText(/job title/i)).toBeNull();
    expect(screen.getByText(run.task)).toBeTruthy();
    const pill = (className: string) =>
      document
        .querySelector(`.${className}`)
        ?.textContent?.replace(/\s+/g, " ")
        .trim();
    expect(pill("prepare-pill--files")).toBe("1 file");
    expect(pill("prepare-pill--reuse")).toBe("0 reuse");
    expect(pill("prepare-pill--style")).toBe("1 style");

    await user.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
