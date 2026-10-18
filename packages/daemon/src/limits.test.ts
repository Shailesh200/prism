import { describe, expect, it } from "vitest";
import { parsePmset, parseSysfs, shouldPauseForBattery } from "./battery.js";
import { DEFAULT_DAEMON_CONFIG, parseDaemonConfig } from "./config.js";
import { daemonEnabled } from "./paths.js";
import { isIgnoredPath } from "./pool.js";

describe("battery", () => {
  it("reads pmset on battery and on AC", () => {
    expect(
      parsePmset(
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t18%; discharging; 1:02 remaining",
      ),
    ).toEqual({ onBattery: true, percent: 18 });
    expect(
      parsePmset(
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t64%; charging",
      ),
    ).toEqual({ onBattery: false, percent: 64 });
    expect(parsePmset("Now drawing from 'AC Power'\n")).toBeNull();
  });

  it("reads sysfs", () => {
    expect(parseSysfs("12\n", "Discharging\n")).toEqual({
      onBattery: true,
      percent: 12,
    });
    expect(parseSysfs("12", "Charging")).toEqual({
      onBattery: false,
      percent: 12,
    });
  });

  it("pauses only on battery below the threshold", () => {
    expect(shouldPauseForBattery({ onBattery: true, percent: 19 }, 20)).toBe(
      true,
    );
    expect(shouldPauseForBattery({ onBattery: true, percent: 20 }, 20)).toBe(
      false,
    );
    expect(shouldPauseForBattery({ onBattery: false, percent: 5 }, 20)).toBe(
      false,
    );
    expect(shouldPauseForBattery(null, 20)).toBe(false);
  });
});

describe("config", () => {
  it("falls back to defaults for missing or bad values", () => {
    expect(parseDaemonConfig(null)).toEqual(DEFAULT_DAEMON_CONFIG);
    expect(
      parseDaemonConfig({ idleMinutes: -1, nice: 40, maxWorkspaces: 0 }),
    ).toEqual({ ...DEFAULT_DAEMON_CONFIG, nice: 19, maxWorkspaces: 1 });
    expect(parseDaemonConfig({ idleMinutes: 5 }).idleMinutes).toBe(5);
  });
});

describe("daemonEnabled", () => {
  it("is off in test runners unless a test opts in", () => {
    expect(daemonEnabled({ VITEST: "true" })).toBe(false);
    expect(daemonEnabled({ VITEST: "true", PRISM_DAEMON: "1" })).toBe(true);
    expect(daemonEnabled({ PRISM_DAEMON: "0" })).toBe(false);
    expect(daemonEnabled({})).toBe(true);
  });
});

describe("isIgnoredPath", () => {
  it("skips dependency, build and VCS folders", () => {
    expect(isIgnoredPath("node_modules/x/index.js")).toBe(true);
    expect(isIgnoredPath("packages/a/dist/index.js")).toBe(true);
    expect(isIgnoredPath(".git/index")).toBe(true);
    expect(isIgnoredPath("src/dist-utils.ts")).toBe(false);
    expect(isIgnoredPath("src/index.ts")).toBe(false);
  });
});
