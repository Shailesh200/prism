/**
 * Characterisation tests for DomainScreen pure aggregations (M-053 Phase 1).
 */

import type { GraphSnapshotDto } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import {
  fileStem,
  inboundDepCounts,
  lookupInbound,
  normalizeDepKey,
} from "./domain-aggregations.js";

describe("normalizeDepKey", () => {
  it("strips file: prefix, ./, and backslashes", () => {
    expect(normalizeDepKey("file:src\\util.ts")).toBe("src/util.ts");
    expect(normalizeDepKey("./src/util.ts")).toBe("src/util.ts");
    expect(normalizeDepKey("  src/util.ts  ")).toBe("src/util.ts");
  });
});

describe("inboundDepCounts + lookupInbound", () => {
  it("counts in-degree by normalised edge.to", () => {
    const graph: GraphSnapshotDto = {
      id: "g",
      nodes: [],
      edges: [
        {
          id: "e1",
          kind: "depends_on",
          from: "a.ts",
          to: "file:./src/util.ts",
        },
        { id: "e2", kind: "depends_on", from: "b.ts", to: "src/util.ts" },
        { id: "e3", kind: "depends_on", from: "c.ts", to: "src/other.ts" },
      ],
    };
    const inDeg = inboundDepCounts(graph);
    expect(inDeg.get("src/util.ts")).toBe(2);
    expect(inDeg.get("src/other.ts")).toBe(1);
    expect(lookupInbound(inDeg, "file:src/util.ts")).toBe(2);
    expect(lookupInbound(inDeg, "missing.ts")).toBe(0);
  });

  it("returns an empty map for null/undefined graphs", () => {
    expect(inboundDepCounts(null).size).toBe(0);
    expect(inboundDepCounts(undefined).size).toBe(0);
  });
});

describe("fileStem", () => {
  it("strips test/spec suffixes and extensions, lowercases", () => {
    expect(fileStem("src/Foo.Bar.test.tsx")).toBe("foo.bar");
    expect(fileStem("pkg/handler_test.go")).toBe("handler_test");
    expect(fileStem("screens/HomeScreen.tsx")).toBe("homescreen");
    expect(fileStem("util.spec.ts")).toBe("util");
  });
});
