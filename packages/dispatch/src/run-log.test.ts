import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLogPath, rotatedRunLogPath } from "./paths.js";
import {
  appendRunLog,
  lifecycleLogEntry,
  logEntryFromEvent,
  MAX_ENTRY_TEXT,
  MAX_LOG_BYTES,
  parseRunLogLine,
  readRunLog,
} from "./run-log.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "prism-run-log-"));
  roots.push(root);
  return root;
}

describe("append-only job console", () => {
  it("keeps every entry instead of overwriting one activity line", async () => {
    const root = await tempRoot();
    await appendRunLog(
      root,
      "job-1",
      lifecycleLogEntry("starting", "Starting"),
    );
    await appendRunLog(
      root,
      "job-1",
      lifecycleLogEntry("thinking", "Thinking"),
    );
    await appendRunLog(root, "job-1", lifecycleLogEntry("editing", "Editing"));

    const page = await readRunLog(root, "job-1");
    expect(page.entries.map((entry) => entry.text)).toEqual([
      "Starting",
      "Thinking",
      "Editing",
    ]);
    expect(page.totalCount).toBe(3);
    expect(page.truncated).toBe(false);
  });

  it("returns the newest entries when the log is longer than the limit", async () => {
    const root = await tempRoot();
    for (let i = 0; i < 10; i++) {
      await appendRunLog(root, "job-1", lifecycleLogEntry("tool", `step ${i}`));
    }
    const page = await readRunLog(root, "job-1", { limit: 3 });
    expect(page.entries.map((entry) => entry.text)).toEqual([
      "step 7",
      "step 8",
      "step 9",
    ]);
    expect(page.truncated).toBe(true);
    expect(page.totalCount).toBe(10);
  });

  it("tails forward from a timestamp so a console can poll", async () => {
    const root = await tempRoot();
    const first = new Date("2026-01-01T00:00:00.000Z");
    const second = new Date("2026-01-01T00:00:05.000Z");
    await appendRunLog(
      root,
      "job-1",
      lifecycleLogEntry("thinking", "old", first),
    );
    await appendRunLog(
      root,
      "job-1",
      lifecycleLogEntry("thinking", "new", second),
    );

    const page = await readRunLog(root, "job-1", {
      since: first.toISOString(),
    });
    expect(page.entries.map((entry) => entry.text)).toEqual(["new"]);
  });

  it("survives a half-written final line from a killed worker", async () => {
    const root = await tempRoot();
    await appendRunLog(root, "job-1", lifecycleLogEntry("thinking", "good"));
    const path = runLogPath(root, "job-1");
    const raw = await readFile(path, "utf8");
    await writeFile(path, `${raw}{"ts":"2026-01-01T00`, "utf8");

    const page = await readRunLog(root, "job-1");
    expect(page.entries.map((entry) => entry.text)).toEqual(["good"]);
  });

  it("still reads history after rotation", async () => {
    // Reading only the live file threw away everything before the last roll —
    // exactly the window you want when a long job went wrong.
    const root = await tempRoot();
    const path = runLogPath(root, "job-1");
    await appendRunLog(root, "job-1", lifecycleLogEntry("thinking", "seed"));
    await writeFile(path, "x".repeat(MAX_LOG_BYTES + 1), "utf8");
    await appendRunLog(root, "job-1", lifecycleLogEntry("thinking", "before"));
    // Force a second rotation so "before" lands in the rotated generation.
    await writeFile(path, "y".repeat(MAX_LOG_BYTES + 1), "utf8");
    await appendRunLog(root, "job-1", lifecycleLogEntry("thinking", "after"));

    const page = await readRunLog(root, "job-1");
    expect(page.entries.map((entry) => entry.text)).toEqual(["after"]);

    // And a normal rotation keeps the older lines readable, oldest first.
    const root2 = await tempRoot();
    const path2 = runLogPath(root2, "job-2");
    await appendRunLog(root2, "job-2", lifecycleLogEntry("thinking", "old"));
    const seeded = await readFile(path2, "utf8");
    await writeFile(rotatedRunLogPath(path2), seeded.repeat(1), "utf8");
    await appendRunLog(root2, "job-2", lifecycleLogEntry("thinking", "new"));
    const page2 = await readRunLog(root2, "job-2");
    expect(page2.entries.map((entry) => entry.text)).toEqual([
      "old",
      "old",
      "new",
    ]);
  });

  it("rotates instead of growing without bound", async () => {
    const root = await tempRoot();
    const path = runLogPath(root, "job-1");
    // Seed a file already past the cap, then append once.
    await appendRunLog(root, "job-1", lifecycleLogEntry("thinking", "seed"));
    await writeFile(path, "x".repeat(MAX_LOG_BYTES + 1), "utf8");
    await appendRunLog(root, "job-1", lifecycleLogEntry("thinking", "after"));

    const rotated = await stat(rotatedRunLogPath(path));
    expect(rotated.size).toBeGreaterThan(MAX_LOG_BYTES);
    const page = await readRunLog(root, "job-1");
    expect(page.entries.map((entry) => entry.text)).toEqual(["after"]);
  });

  it("returns an empty page for a job that never logged", async () => {
    const root = await tempRoot();
    const page = await readRunLog(root, "missing");
    expect(page.entries).toEqual([]);
    expect(page.totalCount).toBe(0);
  });
});

describe("log entries from stream events", () => {
  it("keeps full tool and edit detail", () => {
    expect(
      logEntryFromEvent({ type: "tool_call", name: "edit_file" }),
    ).toMatchObject({ phase: "tool", tool: "edit_file" });
    expect(logEntryFromEvent({ type: "edit" })).toMatchObject({
      phase: "editing",
    });
  });

  it("records errors at error level so a console can highlight them", () => {
    const entry = logEntryFromEvent({ type: "error", text: "boom" });
    expect(entry).toMatchObject({ level: "error", text: "boom" });
  });

  it("keeps an unrecognised event that carries text", () => {
    // activityFromEvent drops these; the console should not, because an
    // unknown event is exactly what you need when a job goes wrong.
    const entry = logEntryFromEvent({ type: "mystery", text: "something" });
    expect(entry?.text).toBe("something");
  });

  it("ignores events with nothing to say", () => {
    expect(logEntryFromEvent({ type: "mystery" })).toBeUndefined();
    expect(logEntryFromEvent(undefined)).toBeUndefined();
  });

  it("caps a runaway entry", () => {
    const entry = logEntryFromEvent({
      type: "assistant",
      text: "y".repeat(MAX_ENTRY_TEXT * 3),
    });
    expect(entry!.text.length).toBeLessThanOrEqual(MAX_ENTRY_TEXT);
  });
});

describe("log line encoding", () => {
  it("round-trips an entry", () => {
    const entry = lifecycleLogEntry("tool", "Using grep");
    expect(parseRunLogLine(JSON.stringify(entry))).toEqual(entry);
  });

  it("rejects junk without throwing", () => {
    expect(parseRunLogLine("not json")).toBeUndefined();
    expect(parseRunLogLine("")).toBeUndefined();
    expect(parseRunLogLine('{"ts":1}')).toBeUndefined();
  });
});
