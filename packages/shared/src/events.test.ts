import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eventsPath, recordEvent } from "./events.js";

const home = () => ({ PRISM_HOME: mkdtempSync(join(tmpdir(), "prism-ev-")) });

describe("recordEvent (plan §2.5)", () => {
  it("EV-1 appends one JSON line with ts, pid, event, outcome", () => {
    const env = home();
    expect(recordEvent({ event: "hook.stop", outcome: "ok" }, { env })).toEqual(
      { written: true },
    );
    const line = JSON.parse(readFileSync(eventsPath(env), "utf8").trim());
    expect(line).toMatchObject({
      event: "hook.stop",
      outcome: "ok",
      pid: process.pid,
    });
    expect(typeof line.ts).toBe("string");
  });
  it("EV-2 a non-ok outcome without a reason is a programming error", () => {
    expect(() =>
      recordEvent({ event: "x", outcome: "degraded" }, { env: home() }),
    ).toThrow(/reason/);
  });
  it("EV-3 rotates at maxBytes and keeps three generations", () => {
    const env = home();
    for (let i = 0; i < 5; i += 1) {
      recordEvent({ event: `e${i}`, outcome: "ok" }, { env, maxBytes: 10 });
    }
    const p = eventsPath(env);
    expect(existsSync(`${p}.1`)).toBe(true);
    expect(existsSync(`${p}.2`)).toBe(true);
    expect(existsSync(`${p}.3`)).toBe(false);
    expect(readFileSync(p, "utf8")).toContain('"e4"');
  });
  it("EV-4 an unwritable log reports written:false instead of throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-ev-"));
    const file = join(dir, "not-a-dir");
    writeFileSync(file, "");
    const out = recordEvent(
      { event: "x", outcome: "ok" },
      { env: { PRISM_HOME: join(file, "home") } },
    );
    expect(out.written).toBe(false);
  });
});
