import { describe, expect, it } from "vitest";
import type { EventLine } from "@repo-prism/shared/events";
import { parseSince, summarizeEvents } from "./stats.js";

const at = (minutesAgo: number, now: number) =>
  new Date(now - minutesAgo * 60_000).toISOString();

describe("prism stats (COV-73)", () => {
  it("parses durations and rejects anything else", () => {
    expect(parseSince("1d")).toBe(86_400_000);
    expect(parseSince("30m")).toBe(1_800_000);
    expect(parseSince("yesterday")).toBeUndefined();
  });

  it("gives p50/p95, outcome counts and top reasons equal to a recount", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    const lines: EventLine[] = [];
    for (let i = 1; i <= 20; i += 1)
      lines.push({
        event: "hook.prompt",
        outcome: "ok",
        durationMs: i * 10,
        ts: at(i, now),
        pid: 1,
      });
    lines.push({
      event: "hook.prompt",
      outcome: "skipped",
      reason: "question",
      ts: at(1, now),
      pid: 1,
    });
    lines.push({
      event: "hook.prompt",
      outcome: "skipped",
      reason: "question",
      ts: at(2, now),
      pid: 1,
    });
    lines.push({
      event: "hook.stop",
      outcome: "error",
      reason: "timeout",
      durationMs: 3000,
      ts: at(3000, now),
      pid: 1,
    });
    const all = summarizeEvents(lines, undefined, now);
    const prompt = all.find((row) => row.event === "hook.prompt");
    expect(prompt).toMatchObject({
      count: 22,
      outcomes: { ok: 20, skipped: 2 },
      p50Ms: 100,
      p95Ms: 190,
      topReasons: [{ reason: "question", count: 2 }],
    });
    // --since 1d drops the two-day-old stop event.
    expect(summarizeEvents(lines, 86_400_000, now).map((r) => r.event)).toEqual(
      ["hook.prompt"],
    );
  });
});
