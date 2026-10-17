/**
 * PR 10: a visible update notice, never a silent update. `prism start` and
 * `prism doctor` end with `Prism <new> is out. To update, run: npm i -g
 * @repo-prism/cli@latest` when the daily npm check (shared/update-check,
 * cached 24 h in ~/.prism/update.json) finds a newer release. Only an npm
 * install is checked: a checkout has no "newer on npm".
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ok } from "@repo-prism/shared";
import {
  checkForUpdate,
  updateLine,
  type UpdateCheckOutcome,
} from "@repo-prism/shared/update-check";
import type { CommandHandler } from "./runtime.js";

/** This CLI's package root: `<root>/dist/update-line.js` or `<root>/src/…`. */
function cliRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/** The running CLI's version, and whether it is an npm install. */
export function cliBuild(root = cliRoot()): {
  readonly version: string;
  readonly fromNpm: boolean;
} {
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version?: unknown;
    };
    if (typeof pkg.version === "string") version = pkg.version;
  } catch {
    // An unreadable manifest only means no notice.
  }
  return {
    version,
    fromNpm: root.replaceAll("\\", "/").includes("/node_modules/"),
  };
}

export type UpdateDeps = {
  readonly env?: NodeJS.ProcessEnv;
  readonly build?: { readonly version: string; readonly fromNpm: boolean };
  readonly check?: typeof checkForUpdate;
};

/** The daily check for the running CLI: `skipped` for a checkout. */
export async function checkCliUpdate(
  deps: UpdateDeps = {},
): Promise<UpdateCheckOutcome> {
  const build = deps.build ?? cliBuild();
  if (!build.fromNpm) return { kind: "skipped", reason: "local-checkout" };
  return (deps.check ?? checkForUpdate)({
    currentVersion: build.version,
    env: deps.env ?? process.env,
  });
}

/** The notice line, or undefined (nothing newer, a checkout, or no answer). */
export async function cliUpdateLine(
  deps: UpdateDeps = {},
): Promise<string | undefined> {
  try {
    const outcome = await checkCliUpdate(deps);
    return outcome.kind === "available" ? updateLine(outcome.latest) : undefined;
  } catch {
    return undefined;
  }
}

/** `handler`, with the notice as the last human line when one is due. */
export function withUpdateLine(
  handler: CommandHandler,
  deps: UpdateDeps = {},
): CommandHandler {
  return async (context) => {
    const [result, line] = await Promise.all([
      handler(context),
      cliUpdateLine(deps),
    ]);
    if (!result.ok || !line || result.value.rawJson) return result;
    const outcome = result.value;
    return ok({
      ...outcome,
      human: (output) => `${outcome.human(output)}\n\n${line}`,
    });
  };
}
