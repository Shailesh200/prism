import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type BatteryState = {
  readonly onBattery: boolean;
  readonly percent: number;
};

/** `pmset -g batt` on macOS. */
export function parsePmset(output: string): BatteryState | null {
  const percent = /(\d{1,3})%/.exec(output);
  if (!percent?.[1]) return null;
  return {
    onBattery: /'Battery Power'/.test(output),
    percent: Number(percent[1]),
  };
}

/** `/sys/class/power_supply/BAT*` on Linux. */
export function parseSysfs(
  capacity: string,
  status: string,
): BatteryState | null {
  const percent = Number.parseInt(capacity.trim(), 10);
  if (!Number.isFinite(percent)) return null;
  return { onBattery: status.trim() === "Discharging", percent };
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 2_000 }, (error, stdout) => {
      resolve(error ? "" : String(stdout));
    });
  });
}

/** Null when the machine has no battery or the platform cannot say. */
export async function readBattery(
  platform: NodeJS.Platform = process.platform,
): Promise<BatteryState | null> {
  if (platform === "darwin") {
    const output = await run("pmset", ["-g", "batt"]);
    return output ? parsePmset(output) : null;
  }
  if (platform === "linux") {
    const root = "/sys/class/power_supply";
    try {
      const battery = (await readdir(root)).find((name) =>
        name.startsWith("BAT"),
      );
      if (!battery) return null;
      const [capacity, status] = await Promise.all([
        readFile(join(root, battery, "capacity"), "utf8"),
        readFile(join(root, battery, "status"), "utf8"),
      ]);
      return parseSysfs(capacity, status);
    } catch {
      return null;
    }
  }
  return null;
}

export function shouldPauseForBattery(
  state: BatteryState | null,
  thresholdPercent: number,
): boolean {
  return Boolean(state?.onBattery && state.percent < thresholdPercent);
}
