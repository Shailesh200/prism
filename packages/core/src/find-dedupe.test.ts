import { describe, expect, it } from "vitest";
import { dedupeDeclarations, lineAt } from "./find-dedupe.js";

describe("dedupeDeclarations (plan §4.5)", () => {
  const edges: Record<string, string[]> = {
    "src/index.ts": ["src/request.ts"],
    "src/mid.ts": ["src/index.ts"],
  };
  const targets = (p: string) => edges[p] ?? [];

  it("FIND-1 collapses overload signatures to one row", () => {
    const rows = dedupeDeclarations(
      [
        {
          name: "parseBody",
          kind: "method",
          path: "src/request.ts",
          start: 30,
        },
        {
          name: "parseBody",
          kind: "method",
          path: "src/request.ts",
          start: 10,
        },
        {
          name: "parseBody",
          kind: "variable",
          path: "src/utils/body.ts",
          start: 5,
        },
      ],
      targets,
    );
    expect(rows.map((r) => [r.path, r.start])).toEqual([
      ["src/request.ts", 10],
      ["src/utils/body.ts", 5],
    ]);
  });

  it("FIND-2 a re-export (even two barrels deep) points to the defining file", () => {
    const rows = dedupeDeclarations(
      [
        {
          name: "HonoRequest",
          kind: "class",
          path: "src/request.ts",
          start: 1,
        },
        { name: "HonoRequest", kind: "export", path: "src/index.ts", start: 2 },
        { name: "HonoRequest", kind: "export", path: "src/mid.ts", start: 3 },
      ],
      targets,
    );
    expect(rows).toEqual([
      {
        name: "HonoRequest",
        kind: "class",
        path: "src/request.ts",
        start: 1,
        reexportedBy: ["src/index.ts", "src/mid.ts"],
      },
    ]);
  });

  it("FIND-3 an export with no reachable declaration stays a row", () => {
    const rows = dedupeDeclarations(
      [{ name: "X", kind: "export", path: "src/lone.ts", start: 0 }],
      targets,
    );
    expect(rows.map((r) => r.path)).toEqual(["src/lone.ts"]);
  });

  it("lineAt is 1-based", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(1);
    expect(lineAt("a\nb\nc", 4)).toBe(3);
  });
});
