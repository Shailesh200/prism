import { describe, expect, it } from "vitest";
import {
  clusterKeyForLabel,
  layoutOverviewGraph,
  shortLabelInCluster,
} from "./overview-layout.js";

describe("overview-layout", () => {
  it("clusters by package scope", () => {
    expect(clusterKeyForLabel("@prism/core")).toBe("@prism");
    expect(clusterKeyForLabel("@fixture/auth")).toBe("@fixture");
    expect(clusterKeyForLabel("Dashboard")).toBe("App");
    expect(shortLabelInCluster("@prism/core", "@prism")).toBe("core");
  });

  it("lays out islands without dumping every related edge", () => {
    const features = [
      {
        id: "feature:a",
        kind: "feature",
        label: "@prism/analyzer",
        attrs: { confidence: 0.9 },
      },
      {
        id: "feature:b",
        kind: "feature",
        label: "@prism/core",
        attrs: { confidence: 0.8 },
      },
      {
        id: "feature:c",
        kind: "feature",
        label: "@fixture/auth",
        attrs: { confidence: 0.8 },
      },
      {
        id: "feature:d",
        kind: "feature",
        label: "Dashboard",
        attrs: { confidence: 0.85 },
      },
    ];
    const edges = [
      {
        id: "e1",
        kind: "related",
        from: "feature:a",
        to: "feature:b",
      },
      {
        id: "e2",
        kind: "related",
        from: "feature:a",
        to: "feature:c",
      },
      {
        id: "e3",
        kind: "related",
        from: "feature:d",
        to: "feature:c",
      },
    ];

    const landing = layoutOverviewGraph(features, edges, null, () => undefined);
    expect(landing.nodes.some((n) => n.id === "group:@prism")).toBe(true);
    expect(landing.nodes.some((n) => n.id === "group:@fixture")).toBe(true);
    expect(landing.nodes.some((n) => n.id === "group:App")).toBe(true);
    // Ambient "arterial" routes: curated + capped, never every edge dumped.
    expect(landing.edges.length).toBeLessThanOrEqual(8);
    expect(landing.edges.length).toBeLessThanOrEqual(edges.length);

    const focused = layoutOverviewGraph(
      features,
      edges,
      "feature:a",
      () => undefined,
    );
    expect(focused.edges).toHaveLength(2);
    expect(
      focused.nodes
        .filter((n) => n.id.startsWith("feature:"))
        .every((n) => typeof n.data === "object"),
    ).toBe(true);
  });
});
