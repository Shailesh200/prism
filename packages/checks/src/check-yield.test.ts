import { afterEach, describe, expect, it } from "vitest";
import {
  CHECK_YIELD_MS,
  checksYielding,
  setChecksYield,
  trackCheckGroupForTest,
  yieldCommands,
} from "./verify.js";

afterEach(async () => {
  await setChecksYield(false);
  trackCheckGroupForTest(4242, false);
});

describe("check yield mode (round 5, D)", () => {
  it("picks the idlest class each platform offers", () => {
    expect(yieldCommands(7, "darwin")).toEqual([
      ["/usr/sbin/taskpolicy", "-b", "-p", "7"],
    ]);
    expect(yieldCommands(7, "linux")).toEqual([
      ["chrt", "-a", "-i", "-p", "0", "7"],
      ["ionice", "-c", "3", "-p", "7"],
    ]);
    expect(yieldCommands(7, "win32")).toEqual([]);
  });

  it("demotes every process of a running check's group when it turns on", async () => {
    trackCheckGroupForTest(4242, true);
    const ran: string[][] = [];
    await setChecksYield(true, {
      exec: async (argv) => {
        ran.push([...argv]);
        return argv[0] === "pgrep" ? "4242\n4243\n" : "";
      },
    });
    const expected = [4242, 4243].flatMap((pid) => yieldCommands(pid));
    if (expected.length === 0) {
      expect(ran).toEqual([]);
      return;
    }
    expect(ran[0]).toEqual(["pgrep", "-g", "4242"]);
    expect(ran.slice(1)).toEqual(expect.arrayContaining(expected));
    expect(ran).toHaveLength(1 + expected.length);
  });

  it("falls back cleanly when a tool is missing", async () => {
    trackCheckGroupForTest(4242, true);
    await expect(
      setChecksYield(true, { exec: async () => "" }),
    ).resolves.toBeUndefined();
    expect(checksYielding()).toBe(true);
  });

  it("ends at the stop, or by itself after ten minutes", async () => {
    const now = 1_000_000;
    await setChecksYield(true, { now, exec: async () => "" });
    expect(checksYielding(now + CHECK_YIELD_MS - 1)).toBe(true);
    expect(checksYielding(now + CHECK_YIELD_MS)).toBe(false);
    await setChecksYield(false);
    expect(checksYielding(now)).toBe(false);
  });
});
