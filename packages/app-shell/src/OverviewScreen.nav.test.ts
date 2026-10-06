import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { routeOverviewNav } from "./OverviewScreen.js";

describe("routeOverviewNav", () => {
  it("forwards Iris, Jobs, and Skills instead of swallowing them", () => {
    const onNavigate = vi.fn();
    const props = { onOpenDna: vi.fn(), onNavigate };
    routeOverviewNav("iris", props);
    routeOverviewNav("jobs", props);
    routeOverviewNav("skills", props);
    expect(onNavigate.mock.calls.map((call) => call[0])).toEqual([
      "iris",
      "jobs",
      "skills",
    ]);
    expect(props.onOpenDna).not.toHaveBeenCalled();
  });

  it("keeps DNA on its dedicated opener", () => {
    const onOpenDna = vi.fn();
    const onNavigate = vi.fn();
    routeOverviewNav("dna", { onOpenDna, onNavigate });
    expect(onOpenDna).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("keeps Commit Activity on its own card, without a jobs token rollup", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "OverviewScreen.tsx"),
      "utf8",
    );
    const commit = source.indexOf("Commit Activity");
    expect(commit).toBeGreaterThan(-1);
    expect(source.indexOf("</article>", commit)).toBeGreaterThan(commit);
    expect(source).not.toContain("ov-card--token");
    expect(source).not.toContain("TokenCostChart");
    expect(source).not.toContain("tokenUsageInRange");
    expect(source).toContain('section className="ov-grid ov-grid--2"');
    expect(source).toContain("JOB_RANGE_PRESETS");
  });

  it("uses a chart skeleton instead of loading copy while git history loads", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "OverviewScreen.tsx"),
      "utf8",
    );
    expect(source).toContain("ChartSkeleton");
    expect(source).toContain("ov-chart-skel");
    expect(source).toContain('label="Loading commit history"');
    expect(source).toMatch(/gitStatus === "loading" && days\.length === 0/);
  });
});
