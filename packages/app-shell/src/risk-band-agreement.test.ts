import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { riskBandDescriptor, riskToBand } from "@prism/shared";

/**
 * Q-023: Blast Radius and Change Review each carried their own copy of the
 * band thresholds and disagreed about the same score. M-051 Phase 3 deleted
 * both copies in favour of `riskToBand` in `@prism/shared`. These tests guard
 * the deletion — a re-introduced literal is exactly how the drift started.
 */

const SCREENS = ["BlastRadiusScreen.tsx", "ChangeReviewScreen.tsx"] as const;

function screenSource(file: string): string {
  return readFileSync(join(import.meta.dirname, file), "utf8");
}

describe("risk band agreement across screens", () => {
  it("both screens derive bands from the shared helper", () => {
    for (const file of SCREENS) {
      const src = screenSource(file);
      expect(src, `${file} should import the shared helper`).toMatch(
        /riskBandDescriptor|riskToBand/,
      );
    }
  });

  it("neither screen compares a risk score against a local threshold", () => {
    // Catches `risk >= 70`, `risk > 60`, `score < 20` and similar — the shape
    // the duplicated thresholds took before they were removed.
    const localThreshold = /\b(risk|score)\b\s*[<>]=?\s*\d+/i;

    for (const file of SCREENS) {
      const offenders = screenSource(file)
        .split("\n")
        .map((line, i) => ({ line: line.trim(), no: i + 1 }))
        .filter(({ line }) => localThreshold.test(line));

      expect(
        offenders,
        `${file} must band via @prism/shared, not local thresholds:\n${offenders
          .map(({ line, no }) => `  L${no}: ${line}`)
          .join("\n")}`,
      ).toEqual([]);
    }
  });

  it("resolves the same band for every score both screens can render", () => {
    // A golden sweep across the full 0-100 range plus both boundaries. If a
    // screen ever forks the logic again, this table is what it has to match.
    const golden: Record<string, string> = {};
    for (let score = 0; score <= 100; score += 1) {
      golden[String(score)] = riskToBand(score);
    }

    expect(golden["0"]).toBe("low");
    expect(golden["19"]).toBe("low");
    expect(golden["20"]).toBe("mid");
    expect(golden["59"]).toBe("mid");
    expect(golden["60"]).toBe("high");
    expect(golden["100"]).toBe("high");

    // The descriptor a screen renders must agree with the band it computes.
    for (let score = 0; score <= 100; score += 1) {
      expect(riskBandDescriptor(score).id).toBe(riskToBand(score));
      expect(riskBandDescriptor(score).tone).toBe(riskToBand(score));
    }
  });

  it("labels stay stable so the two screens read the same to a user", () => {
    expect(riskBandDescriptor(85).short).toBe("High");
    expect(riskBandDescriptor(30).short).toBe("Moderate");
    expect(riskBandDescriptor(5).short).toBe("Low");
  });
});
