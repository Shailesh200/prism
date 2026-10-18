import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deadlineRunner,
  RECEIPT_CHECK_TIMEOUT_MS,
  RECEIPT_TOTAL_TIMEOUT_MS,
} from "./receipt.js";

const step = { kind: "package-script", name: "test", script: "test" } as never;

describe("receipt checks: one hard deadline (round 5)", () => {
  it("clips each step's limit to the time left, and starts nothing past it", async () => {
    let clock = 0;
    const asked: number[] = [];
    const run = deadlineRunner(
      95_000,
      60_000,
      () => clock,
      (ms) => {
        asked.push(ms);
        return async () => ({ ok: true, output: "" });
      },
    );
    await run("/r", step); // 95 s left: the step keeps its 60 s
    clock = 80_000;
    await run("/r", step); // 15 s left
    clock = 95_000;
    const late = await run("/r", step); // none left: not started
    expect(asked).toEqual([60_000, 15_000]);
    expect(late).toEqual({
      ok: false,
      timedOut: true,
      output: "not run: the receipt's total time limit was reached",
    });
  });

  it("the whole check pass ends inside the stop-wait hook's wait", () => {
    const hook = readFileSync(
      join(import.meta.dirname, "../../../plugin/hooks/prism-hook.mjs"),
      "utf8",
    );
    const wait = Number(
      /const STOP_WAIT_MS = ([\d_]+);/.exec(hook)?.[1]?.replace(/_/g, ""),
    );
    expect(wait).toBe(110_000);
    // Room for the structural receipt at stop (under its 1 s budget), killing
    // the last check, storing the receipt and the hook's wake.
    expect(RECEIPT_TOTAL_TIMEOUT_MS + 10_000).toBeLessThanOrEqual(wait);
    expect(RECEIPT_CHECK_TIMEOUT_MS).toBeLessThanOrEqual(
      RECEIPT_TOTAL_TIMEOUT_MS,
    );
  });
});
