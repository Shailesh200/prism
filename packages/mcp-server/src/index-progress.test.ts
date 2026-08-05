import { describe, expect, it, vi } from "vitest";
import { createIndexProgressReporter } from "./index-progress.js";

describe("index progress reporter", () => {
  it("emits on phase change and throttles file milestones", () => {
    const sink = vi.fn();
    const report = createIndexProgressReporter(sink);

    report({ phase: "inventory", message: "Indexing workspace…" });
    report({ phase: "analyze", filesDone: 1, filesTotal: 100 });
    report({ phase: "analyze", filesDone: 2, filesTotal: 100 });
    report({ phase: "analyze", filesDone: 26, filesTotal: 100 });
    report({ phase: "finalize", filesDone: 100, filesTotal: 100 });

    expect(sink.mock.calls.map((call) => call[0])).toEqual([
      "Indexing… inventory — Indexing workspace…",
      "Indexing… analyze (1/100)",
      "Indexing… analyze (26/100)",
      "Indexing… finalize (100/100)",
    ]);
  });
});
