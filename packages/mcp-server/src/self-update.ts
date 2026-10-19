/**
 * Install a newer Prism before the MCP server starts.
 *
 * The check itself is cached for 3 days. When a newer release exists, this
 * runs `npm install -g` for the CLI that owns this server, then starts that
 * new build. One failed attempt is remembered until the next check.
 */

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { dirname, join } from "node:path";
import {
  checkForUpdate,
  cliPackageName,
  markInstallAttempt,
  updateNotice,
  type UpdateCheckInput,
} from "./update-check.js";

export type SelfUpdateResult =
  | { readonly kind: "continue" }
  | { readonly kind: "relaunch"; readonly status: number };

export type SelfUpdateInput = {
  readonly currentVersion: string;
  readonly env: NodeJS.ProcessEnv;
  readonly entry?: string;
  readonly execPath: string;
  readonly argv: readonly string[];
  readonly fetchImpl?: UpdateCheckInput["fetchImpl"];
  readonly now?: () => number;
  readonly spawnImpl?: typeof spawnSync;
};

function npmBin(execPath: string): string {
  return process.platform === "win32"
    ? "npm.cmd"
    : join(dirname(execPath), "npm");
}

export async function maybeSelfUpdate(
  input: SelfUpdateInput,
): Promise<SelfUpdateResult> {
  if (input.env.PRISM_SELF_UPDATE_DONE === "1") return { kind: "continue" };
  const outcome = await checkForUpdate({
    currentVersion: input.currentVersion,
    env: input.env,
    ...(input.entry ? { entry: input.entry } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });
  if (outcome.kind !== "available") return { kind: "continue" };
  const pkg = cliPackageName(input.entry);
  if (!pkg || outcome.installAttempted === outcome.latest) {
    const notice = updateNotice(outcome);
    if (notice) process.stderr.write(notice);
    return { kind: "continue" };
  }
  const spawn = input.spawnImpl ?? spawnSync;
  const install = spawn(
    npmBin(input.execPath),
    ["install", "-g", `${pkg}@${outcome.latest}`],
    {
      timeout: 60_000,
      env: input.env,
      stdio: "ignore",
    },
  );
  if (install.status !== 0) {
    await markInstallAttempt(input.env, outcome.latest);
    process.stderr.write(
      `prism-mcp: could not install ${pkg}@${outcome.latest}. Run \`npm install -g ${pkg}\` when you can.\n`,
    );
    return { kind: "continue" };
  }
  const relaunch: SpawnSyncOptions = {
    stdio: "inherit",
    env: { ...input.env, PRISM_SELF_UPDATE_DONE: "1" },
  };
  const child = spawn(input.execPath, [...input.argv], relaunch);
  return { kind: "relaunch", status: child.status ?? 1 };
}
