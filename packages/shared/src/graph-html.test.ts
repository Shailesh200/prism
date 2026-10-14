import { describe, expect, it } from "vitest";
import { renderGraphHtml } from "./graph-html.js";
import type { GraphExport } from "./graph-export.js";

const graph: GraphExport = {
  version: 1,
  generatedAt: "2026-10-12T00:00:00.000Z",
  indexedAt: "2026-10-12T00:00:00.000Z",
  repository: "fixture",
  nodes: [
    { id: "package:app", kind: "package", label: "app" },
    {
      id: "file:src/app.ts",
      kind: "file",
      label: "app.ts",
      path: "src/app.ts",
      package: "app",
    },
  ],
  edges: [
    {
      kind: "contains",
      from: "package:app",
      to: "file:src/app.ts",
      provenance: "measured",
    },
  ],
  stats: { packages: 1, files: 1, tests: 0, symbols: 0, edges: 1 },
};

describe("renderGraphHtml", () => {
  it("is one offline file that contains the graph", () => {
    const html = renderGraphHtml(graph);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("Prism graph");
    expect(html).toContain("src/app.ts");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("Copy as prompt");
    expect(html).toContain("Packages");
    expect(html).not.toContain("viewBox");
  });
});
