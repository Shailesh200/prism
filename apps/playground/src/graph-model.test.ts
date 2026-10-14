import { describe, expect, it } from "vitest";
import type { GraphExport } from "@repo-prism/shared";
import {
  filesInPackage,
  packagesOf,
  promptFor,
  relationsFor,
  visibleFiles,
  visiblePackages,
} from "./graph-model.js";

const graph: GraphExport = {
  version: 1,
  generatedAt: "2026-10-12T00:00:00.000Z",
  indexedAt: "2026-10-12T00:00:00.000Z",
  repository: "fixture",
  nodes: [
    { id: "package:app", kind: "package", label: "app" },
    { id: "package:auth", kind: "package", label: "auth" },
    {
      id: "file:src/app.ts",
      kind: "file",
      label: "app.ts",
      path: "src/app.ts",
      package: "app",
    },
    {
      id: "file:src/checkout.ts",
      kind: "file",
      label: "checkout.ts",
      path: "src/checkout.ts",
      package: "app",
    },
    {
      id: "file:src/dashboard.test.ts",
      kind: "test",
      label: "dashboard.test.ts",
      path: "src/dashboard.test.ts",
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
    {
      kind: "imports",
      from: "file:src/app.ts",
      to: "file:src/checkout.ts",
      provenance: "measured",
    },
    {
      kind: "tests",
      from: "file:src/dashboard.test.ts",
      to: "file:src/app.ts",
      provenance: "measured",
    },
  ],
  stats: { packages: 2, files: 2, tests: 1, symbols: 0, edges: 3 },
};

describe("graph model", () => {
  it("orders packages by how many files they hold", () => {
    expect(packagesOf(graph).map((node) => node.label)).toEqual([
      "app",
      "auth",
    ]);
  });

  it("filters packages and files by the query without dropping the package", () => {
    expect(visiblePackages(graph, "checkout").map((node) => node.label)).toEqual(
      ["app"],
    );
    expect(
      visibleFiles(graph, "app", "checkout").map((node) => node.label),
    ).toEqual(["checkout.ts"]);
    expect(filesInPackage(graph, "auth")).toEqual([]);
  });

  it("groups measured relations and keeps the prompt readable", () => {
    const relations = relationsFor(graph, "file:src/app.ts");
    expect(relations.imports.map((row) => row.other?.label)).toEqual([
      "checkout.ts",
    ]);
    expect(relations.tests.map((row) => row.other?.label)).toEqual([
      "dashboard.test.ts",
    ]);
    expect(relations.files).toEqual([]);
    expect(promptFor(graph.nodes[2]!)).toBe(
      "In src/app.ts, what depends on this and what should I read first?",
    );
  });
});
