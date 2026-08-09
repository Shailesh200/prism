import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HealthHistoryPoint } from "@repo-prism/shared";
import { AppShellClientProvider } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { TrendsScreen, type TrendsScreenProps } from "./TrendsScreen.js";

/**
 * Two audited presentation bugs in the health-over-time chart:
 * - H1: the chart normalised to the series max, so a flat 50/100 rendered at
 *   the top of the plot exactly like 100/100. Scores now use a fixed 0–100
 *   y-axis.
 * - M4: heuristic points (pre-ADR-0029 cached history) rendered as solid
 *   "measured" markers. They now get the same hollow/dashed treatment and
 *   legend accounting as estimated points.
 */

function stubClient(): AppShellClient {
  return {} as unknown as AppShellClient;
}

function point(
  daysAgo: number,
  score: number,
  provenance?: HealthHistoryPoint["provenance"],
): HealthHistoryPoint {
  return {
    at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    score,
    ...(provenance ? { provenance } : {}),
  };
}

function renderTrends(props: Partial<TrendsScreenProps> = {}) {
  const allProps: TrendsScreenProps = {
    map: null,
    repoLabel: "prism",
    gitActivity: null,
    onNavigate: vi.fn(),
    ...props,
  };
  return render(
    <AppShellClientProvider client={stubClient()}>
      <TrendsScreen {...allProps} />
    </AppShellClientProvider>,
  );
}

describe("TrendsScreen health chart", () => {
  it("plots scores on a fixed 0–100 axis so a flat 50 renders at mid-height", () => {
    const { container } = renderTrends({
      healthHistory: {
        points: [point(1, 50, "measured"), point(0, 50, "measured")],
      },
    });
    // w=600, h=200, pad=10 → y = 190 − (50/100)·180 = 100 for both points.
    const polyline = container.querySelector(
      ".tr-chart .ov-chart__svg polyline",
    );
    expect(polyline?.getAttribute("points")).toBe("10,100 590,100");
    const area = container.querySelector(".tr-chart .ov-chart__svg polygon");
    expect(area?.getAttribute("points")).toBe("10,190 10,100 590,100 590,190");
  });

  it("still stretches unbounded commit counts to the series max", () => {
    const { container } = renderTrends({
      gitStatus: "ready",
      gitActivity: {
        root: "/repo",
        generatedAt: new Date().toISOString(),
        available: true,
        days: [
          {
            date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
            commits: 50,
          },
          {
            date: new Date().toISOString().slice(0, 10),
            commits: 100,
          },
        ],
        authors: [],
        weeks: [],
        recentCommits: [],
        recentFiles: [],
      },
    });
    // Commit activity chart keeps the default 0..max domain. The 1W window is
    // seven daily buckets [0,0,0,0,0,50,100]: 50 lands at mid-height (y=100)
    // and 100 at the top (y=10).
    const polyline = container.querySelector(".ov-chart__svg polyline");
    const pts = polyline?.getAttribute("points") ?? "";
    expect(pts.endsWith("590,10")).toBe(true);
    expect(pts).toContain(",100 ");
  });

  it("counts heuristic points alongside estimated ones in the legend", () => {
    renderTrends({
      healthHistory: {
        points: [
          point(2, 60, "estimated"),
          point(1, 62, "heuristic"),
          point(0, 64, "measured"),
        ],
      },
    });
    expect(screen.getByText("1 estimated")).toBeTruthy();
    expect(screen.getByText("1 heuristic")).toBeTruthy();
  });

  it("shows no approximate-series legend for measured-only history", () => {
    renderTrends({
      healthHistory: {
        points: [point(1, 70, "measured"), point(0, 72, "measured")],
      },
    });
    expect(screen.queryByText(/estimated/)).toBeNull();
    expect(screen.queryByText(/heuristic/)).toBeNull();
  });
});
