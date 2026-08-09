import { describe, expect, it } from "vitest";
import {
  BLAST_QUICK_PICK_TOP,
  buildBlastQuickPickItems,
  reviewAllOutcome,
} from "./quick-picks.js";

function affected(path: string, depth: number) {
  return { path, depth, reason: `imports ${path}` };
}

describe("buildBlastQuickPickItems (M-057 P-B3)", () => {
  it("shows risk band header, nearest files first, and an open-full action", () => {
    const items = buildBlastQuickPickItems(
      {
        risk: 85,
        affectedFiles: [
          affected("deep/far.ts", 4),
          affected("near.ts", 1),
          affected("mid.ts", 2),
        ],
      },
      "src/edited.ts",
    );
    expect(items[0]?.label).toMatch(/risk \(85\)/);
    expect(items[0]?.description).toBe("3 affected");
    expect(items[0]?.detail).toBe("src/edited.ts");
    // Depth-sorted: nearest first.
    expect(items[1]?.label).toBe("near.ts");
    expect(items[2]?.label).toBe("mid.ts");
    expect(items[3]?.label).toBe("deep/far.ts");
    const last = items[items.length - 1];
    expect(last?.action).toBe("open");
  });

  it("caps the list at 8 dependents", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      affected(`f${String(i).padStart(2, "0")}.ts`, 20 - i),
    );
    const items = buildBlastQuickPickItems(
      { risk: 10, affectedFiles: many },
      "x.ts",
    );
    // header + 8 + open action
    expect(items).toHaveLength(1 + BLAST_QUICK_PICK_TOP + 1);
    // Depth sort means the smallest depths survive the cap.
    expect(items[1]?.label).toBe("f19.ts");
  });
});

describe("reviewAllOutcome (M-057 P-B2)", () => {
  it("opens Change Review with every changed path", () => {
    const outcome = reviewAllOutcome({
      paths: ["a.ts", "b.ts"],
      base: "HEAD",
    });
    expect(outcome).toEqual({
      kind: "review",
      paths: ["a.ts", "b.ts"],
    });
  });

  it("reports the base when there is nothing to review", () => {
    const outcome = reviewAllOutcome({ paths: [], base: "main" });
    expect(outcome).toEqual({ kind: "empty", base: "main" });
  });
});
