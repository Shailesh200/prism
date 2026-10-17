import { spawnSync } from "node:child_process";
import { getPriority, tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifyStep } from "./types.js";
import {
  CHECK_YIELD_MS,
  checkStarted,
  checksYielding,
  groupCommand,
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

  it("Linux moves the whole group in one ionice -P call", () => {
    expect(groupCommand("yield", 7, "linux")).toEqual([
      "ionice",
      "-c",
      "3",
      "-P",
      "7",
    ]);
    expect(groupCommand("restore", 7, "linux")).toEqual([
      "ionice",
      "-c",
      "0",
      "-P",
      "7",
    ]);
    expect(groupCommand("yield", 7, "darwin")).toBeNull();
  });

  it("macOS demotes every process of a running check's group when it turns on", async () => {
    trackCheckGroupForTest(4242, true);
    const { ran, exec } = recorder();
    await setChecksYield(true, { exec, platform: "darwin" });
    const expected = [4242, 4243].flatMap((pid) =>
      yieldCommands(pid, "darwin"),
    );
    expect(ran[0]).toEqual(["pgrep", "-g", "4242"]);
    expect(ran.slice(1, 3)).toEqual(expect.arrayContaining(expected));
    // A second listing finds nothing new, so the sweep ends.
    expect(ran.slice(3)).toEqual([["pgrep", "-g", "4242"]]);
  });

  it("Linux demotes a running check's group with ionice -P", async () => {
    trackCheckGroupForTest(4242, true);
    const { ran, exec } = recorder();
    await setChecksYield(true, { exec, platform: "linux" });
    expect(ran).toEqual([["ionice", "-c", "3", "-P", "4242"]]);
  });

  it("Linux falls back to each pid when ionice -P fails", async () => {
    trackCheckGroupForTest(4242, true);
    const ran: string[][] = [];
    await setChecksYield(true, {
      platform: "linux",
      exec: async (argv) => {
        ran.push([...argv]);
        if (argv.includes("-P")) return null;
        return argv[0] === "pgrep" ? "4242\n4243\n" : "";
      },
    });
    expect(ran.slice(1)).toEqual(
      expect.arrayContaining([
        ["ionice", "-c", "3", "-p", "4242"],
        ["ionice", "-c", "3", "-p", "4243"],
      ]),
    );
  });

  it("macOS sweeps again until no new process appears (the launch race)", async () => {
    trackCheckGroupForTest(4242, true);
    const listings = ["4242\n", "4242\n4243\n4244\n", "4242\n4243\n4244\n"];
    const ran: string[][] = [];
    await setChecksYield(true, {
      platform: "darwin",
      exec: async (argv) => {
        ran.push([...argv]);
        return argv[0] === "pgrep" ? (listings.shift() ?? "") : "";
      },
    });
    const demoted = ran
      .filter((argv) => argv[0] === "/usr/sbin/taskpolicy")
      .map((argv) => argv[3]);
    expect(demoted.sort()).toEqual(["4242", "4243", "4244"]);
    expect(ran.filter((argv) => argv[0] === "pgrep")).toHaveLength(3);
  });

  it("the stop restores every process of a check still running (Scout, round 5)", async () => {
    trackCheckGroupForTest(4242, true);
    await setChecksYield(true, { exec: async () => "", platform: "darwin" });
    const { ran, exec } = recorder();
    await setChecksYield(false, { exec, platform: "darwin" });
    expect(checksYielding()).toBe(false);
    const expected = [4242, 4243].flatMap((pid) =>
      restoreCommands(pid, "darwin"),
    );
    expect(ran[0]).toEqual(["pgrep", "-g", "4242"]);
    expect(ran.slice(1, 3)).toEqual(expect.arrayContaining(expected));
  });

  it("Linux restores the whole group with ionice -P", async () => {
    trackCheckGroupForTest(4242, true);
    await setChecksYield(true, { exec: async () => "", platform: "linux" });
    const { ran, exec } = recorder();
    await setChecksYield(false, { exec, platform: "linux" });
    expect(ran).toEqual([["ionice", "-c", "0", "-P", "4242"]]);
  });

  it("a check launched while yielding is lowered as a group at once", async () => {
    await setChecksYield(true, { exec: async () => "" });
    const { ran, exec } = recorder();
    await checkStarted(4242, exec, "linux");
    expect(ran).toEqual([["ionice", "-c", "3", "-P", "4242"]]);
  });

  it("a check launched while not yielding is left at nice 19", async () => {
    const { ran, exec } = recorder();
    await checkStarted(4242, exec, "linux");
    expect(ran).toEqual([]);
  });

  it("a stop during a launch's yield sweep still restores the group", async () => {
    await setChecksYield(true, { exec: async () => "" });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const ran: string[][] = [];
    const exec: YieldExec = async (argv) => {
      ran.push([...argv]);
      if (argv.includes("3")) await gate;
      return "";
    };
    const launched = checkStarted(4242, exec, "linux");
    while (ran.length === 0) await new Promise((r) => setImmediate(r));
    // The yield sweep is mid-flight when the stop arrives.
    const stopped = setChecksYield(false, { exec, platform: "linux" });
    release();
    await Promise.all([launched, stopped]);
    expect(ran).toEqual([
      ["ionice", "-c", "3", "-P", "4242"],
      ["ionice", "-c", "0", "-P", "4242"],
    ]);
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
    await setChecksYield(true, { exec, platform: "darwin" });
    ran.length = 0;
    await vi.advanceTimersByTimeAsync(CHECK_YIELD_MS - 1);
    expect(ran).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(checksYielding()).toBe(false);
    const expected = [4242, 4243].flatMap((pid) =>
      restoreCommands(pid, "darwin"),
    );
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
      setChecksYield(true, { exec: async () => null }),
    ).resolves.toBeUndefined();
    await expect(
      setChecksYield(false, { exec: async () => null }),
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
    "a child forked at once runs at nice 19, applied once (not 20)",
    async () => {
      const result = await verifyRunnerWithTimeout(10_000)(tmpdir(), {
        name: "t",
        kind: "argv",
        argv: ["sh", "-c", 'sh -c "ps -o nice= -p \\$\\$"'],
      } as VerifyStep);
      expect(result.ok).toBe(true);
      // nice -n adds to our own value once; the OS caps it (macOS 20, Linux 19).
      const cap = process.platform === "darwin" ? 20 : 19;
      expect(Number(result.output.trim())).toBe(
        Math.min(getPriority() + 19, cap),
      );
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

/** What the check's process reports about its own scheduling class. */
const SELF_CLASS =
  process.platform === "darwin" ? "ps -o pri= -p \\$\\$" : "ionice -p \\$\\$";

function idle(output: string): boolean {
  const line = output.trim();
  return process.platform === "darwin"
    ? Number(line) < 31 // background QoS: pri 4 instead of 31
    : line.startsWith("idle");
}

const realTools =
  process.platform === "darwin" ||
  (process.platform === "linux" &&
    (() => {
      try {
        return spawnSync("ionice", ["-p", String(process.pid)]).status === 0;
      } catch {
        return false;
      }
    })());

describe.runIf(realTools)("real processes (Scout, round 5)", () => {
  it("a child forked in the first instant of a yielded launch ends up idle", async () => {
    await setChecksYield(true);
    try {
      const result = await verifyRunnerWithTimeout(10_000)(tmpdir(), {
        name: "t",
        kind: "argv",
        // Six children fork before any sweep can run: the race Scout hit
        // (5 of 8 stayed at pri 31 when only the leader was moved).
        argv: [
          "sh",
          "-c",
          `for i in 1 2 3 4 5 6; do sh -c "sleep 0.8; ${SELF_CLASS}" & done; wait`,
        ],
      } as VerifyStep);
      expect(result.ok).toBe(true);
      const lines = result.output.trim().split("\n");
      expect(lines).toHaveLength(6);
      expect(lines.filter((line) => !idle(line))).toEqual([]);
    } finally {
      await setChecksYield(false);
    }
  });

  it("the stop puts every process of a yielded check back", async () => {
    await setChecksYield(true);
    const running = verifyRunnerWithTimeout(10_000)(tmpdir(), {
      name: "t",
      kind: "argv",
      argv: ["sh", "-c", `sh -c "sleep 1.5; ${SELF_CLASS}"`],
    } as VerifyStep);
    await new Promise((r) => setTimeout(r, 600));
    await setChecksYield(false);
    const result = await running;
    expect(result.ok).toBe(true);
    expect(idle(result.output)).toBe(false);
  });
});
