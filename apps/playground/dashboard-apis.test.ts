import { describe, expect, it } from "vitest";
import { isDashboardDataPath } from "./dashboard-apis.ts";

describe("isDashboardDataPath", () => {
  it("serves list/read routes from this Dashboard", () => {
    expect(isDashboardDataPath("/api/jobs", "GET")).toBe(true);
    expect(isDashboardDataPath("/api/skills", "GET")).toBe(true);
    expect(isDashboardDataPath("/api/skills", "POST")).toBe(true);
    expect(isDashboardDataPath("/api/envelope", "GET")).toBe(true);
    expect(isDashboardDataPath("/api/prepare-history", "GET")).toBe(true);
    expect(isDashboardDataPath("/api/connectors", "GET")).toBe(true);
    expect(isDashboardDataPath("/api/settings", "GET")).toBe(true);
    expect(isDashboardDataPath("/api/trees", "GET")).toBe(true);
    expect(isDashboardDataPath("/api/trees", "POST")).toBe(true);
    expect(isDashboardDataPath("/api/git-graph", "GET")).toBe(true);
  });

  it("leaves job control on the hub daemon", () => {
    expect(isDashboardDataPath("/api/jobs", "POST")).toBe(false);
    expect(isDashboardDataPath("/api/jobs/news-tab/control", "POST")).toBe(
      false,
    );
    expect(isDashboardDataPath("/api/wipe", "POST")).toBe(false);
  });
});
