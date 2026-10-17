import type { ChangeReceipt } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { RECEIPT_POLLS, withNextStep } from "./receipt.js";

const receipt = (checksState: ChangeReceipt["checksState"]): ChangeReceipt => ({
  id: "r-poll",
  diffHash: "d",
  generatedAt: new Date().toISOString(),
  verdict: "not_proven",
  reason: "still_running",
  checksState,
  touched: { files: ["a.ts"], totalFiles: 1, dependents: 0, truncated: false },
  checks: [],
  testMode: "skipped",
  testFiles: [],
  notProven: [],
  unsupported: [],
  flags: [],
  durationMs: 1,
});

describe("receipt tool: a bounded wait for running checks (website round)", () => {
  it("says call again a few times, then report it as still running", () => {
    const next = Array.from(
      { length: RECEIPT_POLLS },
      () => (withNextStep(receipt("pending")) as { next?: string }).next,
    );
    expect(next[0]).toMatch(/call receipt again .*2 more tries/);
    expect(next[1]).toMatch(/1 more try/);
    expect(next[2]).toMatch(/report NOT PROVEN \(checks still running\)/);
  });

  it("a settled receipt has no next step", () => {
    const done = withNextStep(receipt("done"));
    expect("next" in done).toBe(false);
  });
});
