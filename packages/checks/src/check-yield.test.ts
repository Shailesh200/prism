import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifyStep } from "./types.js";
import {
  CHECK_YIELD_MS,
  checksYielding,
  niceLaunch,
  niceMissingBinary,
  verifyRunnerWithTimeout,
  restoreCommands,
  setChecksYield,
  trackCheckGroupForTest,
  yieldCommands,
  type YieldExec,
} from "./verify.js";

afterEach(async () => {
  vi.useRealTimers();
  await setChecksYield(false, { exec: async () => "" });
  trackCheckGroupForTest(4242, false);
});

/** Records every command; `pgrep -g 4242` lists the leader and one child. */
function recorder(): { ran: string[][]; exec: YieldExec } {
  const ran: string[][] = [];
  return {
    ran,
    exec: async (argv) => {
      ran.push([...argv]);
      return argv[0] === "pgrep" ? "4242\n4243\n" : "";
    },
  };
}

describe("check yield mode (round 5, D)", () => {
  it("picks the idlest class each platform can undo", () => {
    expect(yieldCommands(7, "darwin")).toEqual([
      ["/usr/sbin/taskpolicy", "-b", "-p", "7"],
    ]);
    expect(yieldCommands(7, "linux")).toEqual([
      ["ionice", "-c", "3", "-p", "7"],
    ]);
    expect(yieldCommands(7, "win32")).toEqual([]);
  });

  it("restores each platform to normal check priority", () => {
    expect(restoreCommands(7, "darwin")).toEqual([
      ["/usr/sbin/taskpolicy", "-B", "-p", "7"],
    ]);
    expect(restoreCommands(7, "linux")).toEqual([
      ["ionice", "-c", "0", "-p", "7"],
    ]);
    expect(restoreCommands(7, "win32")).toEqual([]);
  });

  it("demotes every process of a running check's group when it turns on", async () => {
    trackCheckGroupForTest(4242, true);
    const { ran, exec } = recorder();
    await setChecksYield(true, { exec });
    const expected = [4242, 4243].flatMap((pid) => yieldCommands(pid));
    if (expected.length === 0) {
      expect(ran).toEqual([]);
      return;
    }
    expect(ran[0]).toEqual(["pgrep", "-g", "4242"]);
    expect(ran.slice(1)).toEqual(expect.arrayContaining(expected));
    expect(ran).toHaveLength(1 + expected.length);
  });

  it("the stop restores every process of a check still running (Scout, round 5)", async () => {
    trackCheckGroupForTest(4242, true);
    await setChecksYield(true, { exec: async () => "" });
    const { ran, exec } = recorder();
    await setChecksYield(false, { exec });
    expect(checksYielding()).toBe(false);
    const expected = [4242, 4243].flatMap((pid) => restoreCommands(pid));
    if (expected.length === 0) return;
    expect(ran[0]).toEqual(["pgrep", "-g", "4242"]);
    expect(ran.slice(1)).toEqual(expect.arrayContaining(expected));
    expect(ran).toHaveLength(1 + expected.length);
  });

  it("a stop without a yield changes nothing", async () => {
    trackCheckGroupForTest(4242, true);
    const { ran, exec } = recorder();
    await setChecksYield(false, { exec });
    expect(ran).toEqual([]);
  });

  it("restores by itself after ten minutes", async () => {
    vi.useFakeTimers();
    trackCheckGroupForTest(4242, true);
    const { ran, exec } = recorder();
    await setChecksYield(true, { exec });
    ran.length = 0;
    await vi.advanceTimersByTimeAsync(CHECK_YIELD_MS - 1);
    expect(ran).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(checksYielding()).toBe(false);
    const expected = [4242, 4243].flatMap((pid) => restoreCommands(pid));
    expect(ran.slice(1)).toEqual(expect.arrayContaining(expected));
  });

  it("another prompt pushes the expiry back", async () => {
    vi.useFakeTimers();
    const { ran, exec } = recorder();
    trackCheckGroupForTest(4242, true);
    await setChecksYield(true, { exec });
    await vi.advanceTimersByTimeAsync(CHECK_YIELD_MS / 2);
    await setChecksYield(true, { exec });
    ran.length = 0;
    await vi.advanceTimersByTimeAsync(CHECK_YIELD_MS - 1);
    expect(
      ran.filter((argv) => argv.includes("-B") || argv.includes("0")),
    ).toEqual([]);
    expect(checksYielding()).toBe(true);
  });

  it("falls back cleanly when a tool is missing", async () => {
    trackCheckGroupForTest(4242, true);
    await expect(
      setChecksYield(true, { exec: async () => "" }),
    ).resolves.toBeUndefined();
    await expect(
      setChecksYield(false, { exec: async () => "" }),
    ).resolves.toBeUndefined();
  });

  it("checksYielding follows the limit", async () => {
    const now = 1_000_000;
    await setChecksYield(true, { now, exec: async () => "" });
    expect(checksYielding(now + CHECK_YIELD_MS - 1)).toBe(true);
    expect(checksYielding(now + CHECK_YIELD_MS)).toBe(false);
  });
});

describe("checks launch through nice (round 5)", () => {
  it("wraps the argv in nice -n 19, or leaves it alone without nice", () => {
    expect(niceLaunch(["yarn", "test"], "/usr/bin/nice")).toEqual([
      "/usr/bin/nice",
      "-n",
      "19",
      "yarn",
      "test",
    ]);
    const argv = ["yarn", "test"];
    expect(niceLaunch(argv, null)).toBe(argv);
  });

  it("reads nice's exit 127 as a missing binary, nothing else", () => {
    expect(
      niceMissingBinary(127, "nice: vitest: No such file or directory\n"),
    ).toBe(true);
    expect(niceMissingBinary(127, "sh: vitest: command not found")).toBe(false);
    expect(niceMissingBinary(1, "nice: x: No such file or directory")).toBe(
      false,
    );
  });

  it.runIf(process.platform !== "win32")(
    "a child forked at once already runs at nice 19",
    async () => {
      const result = await verifyRunnerWithTimeout(10_000)(tmpdir(), {
        name: "t",
        kind: "argv",
        argv: ["sh", "-c", 'sh -c "ps -o nice= -p \\$\\$"'],
      } as VerifyStep);
      expect(result.ok).toBe(true);
      // nice -n adds to the caller's value; macOS allows up to 20.
      expect(Number(result.output.trim())).toBeGreaterThanOrEqual(19);
    },
  );

  it.runIf(process.platform !== "win32")(
    "a missing check binary is still absent, not failed",
    async () => {
      const result = await verifyRunnerWithTimeout(10_000)(tmpdir(), {
        name: "t",
        kind: "argv",
        argv: ["prism-no-such-binary-xyz"],
      } as VerifyStep);
      expect(result.ok).toBe(false);
      expect(result.absent).toBe(true);
    },
  );
});
