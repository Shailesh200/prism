import { describe, expect, it } from "vitest";
import {
  DASHBOARD_VIEWS,
  parseDashboardHash,
  resolveAppView,
} from "./dashboard-views.js";

describe("resolveAppView", () => {
  it("keeps the nine rail ids", () => {
    for (const view of DASHBOARD_VIEWS) {
      expect(resolveAppView(view)).toBe(view);
    }
  });

  it("aliases retired hashes onto the rail", () => {
    expect(resolveAppView("map")).toBe("impact");
    expect(resolveAppView("domains")).toBe("overview");
    expect(resolveAppView("testing")).toBe("overview");
    expect(resolveAppView("blast")).toBe("impact");
    expect(resolveAppView("guard")).toBe("impact");
    expect(resolveAppView("findings")).toBe("impact");
    expect(resolveAppView("trees")).toBe("dna");
    expect(resolveAppView("dashboard")).toBe("impact");
    expect(resolveAppView("jobs")).toBe("impact");
    expect(resolveAppView("intelligence")).toBe("iris");
    expect(resolveAppView("pulse")).toBe("impact");
  });
});

describe("parseDashboardHash", () => {
  it("defaults empty or unknown to overview", () => {
    expect(parseDashboardHash("")).toBe("overview");
    expect(parseDashboardHash("#")).toBe("overview");
    expect(parseDashboardHash("#/nope")).toBe("overview");
  });

  it("reads iris envelope as iris", () => {
    expect(parseDashboardHash("#/iris/envelope")).toBe("iris");
    expect(parseDashboardHash("#/iris/prepare")).toBe("iris");
  });
});
