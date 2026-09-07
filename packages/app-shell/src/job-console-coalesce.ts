import type { JobConsoleEntry } from "./jobs-types.js";

/**
 * Glue a streaming thinking chunk onto the open thought.
 *
 * Cursor (and similar) emit a few words per event. Cumulative buffers
 * (`"The cat"` then `"The cat sat"`) replace; deltas append with a space.
 */
export function joinThinkingText(prev: string, next: string): string {
  const a = prev.replace(/\s+/g, " ").trim();
  const b = next.replace(/\s+/g, " ").trim();
  if (!a || /^thinking\.?$/i.test(a)) return b || a;
  if (!b || /^thinking\.?$/i.test(b)) return a;
  if (b.startsWith(a)) return b;
  if (a.startsWith(b) || a.endsWith(b)) return a;
  return `${a} ${b}`;
}

export function isModelSpeech(entry: JobConsoleEntry): boolean {
  if (entry.tool) return false;
  if (entry.phase === "thinking") return true;
  if (entry.phase !== "running") return false;
  const text = entry.text.trim();
  if (!text) return false;
  return !/^(Teammate |Done —)/i.test(text);
}

/**
 * One console row per thought: consecutive thinking (and model `running`
 * prose) lines append; a tool starts the next message.
 */
export function coalesceThinkingEntries(
  entries: readonly JobConsoleEntry[],
): JobConsoleEntry[] {
  const out: JobConsoleEntry[] = [];
  for (const entry of entries) {
    const prev = out.at(-1);
    if (
      prev &&
      isModelSpeech(prev) &&
      isModelSpeech(entry) &&
      prev.level === entry.level
    ) {
      const text = joinThinkingText(prev.text, entry.text);
      if (text === prev.text) continue;
      out[out.length - 1] = {
        ...prev,
        text,
        phase:
          prev.phase === "thinking" || entry.phase === "thinking"
            ? "thinking"
            : prev.phase,
      };
      continue;
    }
    out.push(entry);
  }
  return out;
}
