import { RISK_BAND_MIN, riskToBand } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { stripAnsi } from "./output.js";
import {
  bandCell,
  qualityCell,
  renderTable,
  scoreCell,
  terminalWidth,
  truncate,
  wrap,
} from "./table.js";

describe("terminalWidth", () => {
  it("prefers COLUMNS, so a test or a user can pin the layout", () => {
    expect(terminalWidth({ COLUMNS: "120" }, 200)).toBe(120);
  });

  it("falls back to the reported terminal width", () => {
    expect(terminalWidth({}, 132)).toBe(132);
  });

  it("uses 80 when there is no terminal, rather than an unbounded line", () => {
    expect(terminalWidth({})).toBe(80);
  });

  it("ignores nonsense in COLUMNS", () => {
    expect(terminalWidth({ COLUMNS: "wide" }, 100)).toBe(100);
    expect(terminalWidth({ COLUMNS: "0" }, 100)).toBe(100);
    expect(terminalWidth({ COLUMNS: "-5" }, 100)).toBe(100);
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("src/a.ts", 20)).toBe("src/a.ts");
  });

  it("keeps the tail of a path, because that is what identifies it", () => {
    const result = truncate("packages/core/src/workspace.ts", 15, true);
    expect(result).toBe("…c/workspace.ts");
    expect(result).toHaveLength(15);
  });

  it("keeps the head of ordinary text", () => {
    expect(truncate("a long sentence here", 10)).toBe("a long se…");
  });
});

describe("renderTable", () => {
  const columns = [
    { header: "FILE", flex: true },
    { header: "N", align: "right" as const },
  ];

  it("returns nothing for no rows, so callers need no empty-table branch", () => {
    expect(renderTable({ columns, rows: [], color: false })).toBe("");
  });

  it("aligns columns to their widest cell", () => {
    const out = renderTable({
      columns,
      rows: [
        [{ text: "a.ts" }, { text: "1" }],
        [{ text: "bbbbbbbb.ts" }, { text: "22" }],
      ],
      color: false,
      width: 80,
    }).split("\n");

    // Every row starts its second column at the same offset.
    const offsets = out.map((line) => line.indexOf("2") >= 0);
    expect(out[1]).toBe("a.ts          1");
    expect(out[2]).toBe("bbbbbbbb.ts  22");
    expect(offsets).toHaveLength(3);
  });

  it("fits the width by squeezing the flexible column", () => {
    const out = renderTable({
      columns,
      rows: [
        [{ text: "packages/core/src/a/very/long/path.ts" }, { text: "1" }],
      ],
      color: false,
      width: 24,
    });

    for (const line of out.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(24);
    }
    expect(out).toContain("…");
  });

  it("pads by visible width, so colour does not ragged the columns", () => {
    const plain = renderTable({
      columns,
      rows: [
        [{ text: "a.ts" }, { text: "1" }],
        [{ text: "bbbb.ts" }, { text: "2" }],
      ],
      color: false,
      width: 80,
    });
    const colored = renderTable({
      columns,
      rows: [
        [{ text: "a.ts", style: "red" }, { text: "1" }],
        [{ text: "bbbb.ts", style: "green" }, { text: "2" }],
      ],
      color: true,
      width: 80,
    });

    expect(stripAnsi(colored)).toBe(plain);
  });

  it("emits no escapes when colour is off", () => {
    const out = renderTable({
      columns,
      rows: [[{ text: "a.ts", style: "red" }, { text: "1" }]],
      color: false,
      width: 80,
    });
    expect(stripAnsi(out)).toBe(out);
  });
});

describe("band colouring agrees with the shared thresholds", () => {
  // M-051 Phase 3 put `riskToBand` in @repo-prism/shared so that surfaces stop
  // inventing thresholds. These assertions are the CLI's half of that promise.
  it.each([0, 19, 20, 59, 60, 100])("matches riskToBand at %i", (score) => {
    const expected = { low: "green", mid: "yellow", high: "red" }[
      riskToBand(score)
    ];
    expect(scoreCell(score).style).toBe(expected);
  });

  it("bands exactly at the shared boundaries", () => {
    expect(scoreCell(RISK_BAND_MIN.high).style).toBe("red");
    expect(scoreCell(RISK_BAND_MIN.high - 1).style).toBe("yellow");
    expect(scoreCell(RISK_BAND_MIN.mid).style).toBe("yellow");
    expect(scoreCell(RISK_BAND_MIN.mid - 1).style).toBe("green");
  });

  it("words a band with the shared label", () => {
    expect(bandCell(90).text).toBe("High");
    expect(bandCell(30).text).toBe("Moderate");
    expect(bandCell(5).text).toBe("Low");
  });

  it("prints a quality score as itself and only inverts the colour", () => {
    // A health factor of 100 is excellent. An earlier draft printed `100 -
    // score` under a column headed SCORE, which rendered it as 0.
    expect(qualityCell(100)).toEqual({ text: "100", style: "green" });
    expect(qualityCell(0)).toEqual({ text: "0", style: "red" });
    expect(qualityCell(50)).toEqual({ text: "50", style: "yellow" });
  });
});

describe("wrap", () => {
  it("breaks between words, never inside one", () => {
    const lines = wrap("alpha beta gamma delta", 12);
    expect(lines).toEqual(["alpha beta", "gamma delta"]);
  });

  it("respects the indent in the width budget", () => {
    for (const line of wrap("alpha beta gamma delta epsilon", 14, "  ")) {
      expect(line.length).toBeLessThanOrEqual(14);
      expect(line.startsWith("  ")).toBe(true);
    }
  });

  it("keeps a word longer than the width rather than cutting it", () => {
    const lines = wrap("short supercalifragilisticexpialidocious", 20);
    expect(lines.join(" ")).toContain("supercalifragilisticexpialidocious");
  });

  it("never wraps below a usable width", () => {
    // A pathological width would otherwise produce one character per line, so
    // the floor wins over the requested width here.
    expect(wrap("alpha beta gamma", 2)).toEqual(["alpha", "beta", "gamma"]);
  });
});
