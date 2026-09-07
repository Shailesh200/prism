import { describe, expect, it } from "vitest";
import {
  coalesceThinkingEntries,
  joinThinkingText,
} from "./job-console-coalesce.js";
import type { JobConsoleEntry } from "./jobs-types.js";

function line(
  phase: JobConsoleEntry["phase"],
  text: string,
  ts = "2026-01-01T00:00:00.000Z",
): JobConsoleEntry {
  return { ts, phase, text, level: "info" };
}

describe("coalesceThinkingEntries", () => {
  it("appends streaming thinking into one block and breaks on a tool", () => {
    const rows = coalesceThinkingEntries([
      line("thinking", "is allowed, imports"),
      line("thinking", "in DropdownMenu.tsx"),
      line("thinking", "and Popover.tsx would"),
      line("running", "fail typechecking."),
      line("tool", "Using grep"),
      line("thinking", "This likely explains"),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.phase).toBe("thinking");
    expect(rows[0]?.text).toBe(
      "is allowed, imports in DropdownMenu.tsx and Popover.tsx would fail typechecking.",
    );
    expect(rows[1]).toMatchObject({ phase: "tool", text: "Using grep" });
    expect(rows[2]?.text).toBe("This likely explains");
  });

  it("replaces a cumulative thinking buffer instead of duplicating it", () => {
    const rows = coalesceThinkingEntries([
      line("thinking", "The cat"),
      line("thinking", "The cat sat"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe("The cat sat");
  });

  it("joins deltas and ignores a placeholder Thinking line", () => {
    expect(joinThinkingText("thinking.", "The cat sat")).toBe("The cat sat");
    expect(joinThinkingText("The cat sat", "sat")).toBe("The cat sat");
    expect(joinThinkingText("Hello", "world")).toBe("Hello world");
  });
});
