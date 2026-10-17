/**
 * Are the hook configs `prism install` wrote still what this release writes?
 * (round 4, hook upgrades). `prism doctor` shows one line per config.
 * Detection only: `prism doctor --fix` makes the update through the consent
 * step (`confirmAndWrite`), like `prism start`.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkClaudeHooks,
  hookRefreshLine,
} from "@repo-prism/shared/hook-config";
import type { InstallRecord } from "@repo-prism/shared/prism-bin";
import { opencodeShim } from "./hosts.js";

export type HookCheck = {
  readonly label: string;
  readonly status: "ok" | "warn";
  readonly detail: string;
};

/** The settings file is the user's (`~/.claude`) or a repository's. */
function claudeScope(path: string, home: string): "user" | "project" {
  return path === join(home, ".claude", "settings.json") ? "user" : "project";
}

export function claudeHookCheck(
  path: string,
  options: { readonly home?: string } = {},
): HookCheck {
  const scope = claudeScope(path, options.home ?? homedir());
  const result = checkClaudeHooks(path);
  const command =
    scope === "project"
      ? "prism install claude --project"
      : "prism install claude";
  switch (result.kind) {
    case "current":
      return {
        label: "Hooks",
        status: "ok",
        detail: `Claude Code hooks are up to date (${path})`,
      };
    case "absent":
      return {
        label: "Hooks",
        status: "warn",
        detail: `no Prism hooks in ${path}. Run \`${command}\`.`,
      };
    default:
      return {
        label: "Hooks",
        status: "warn",
        detail:
          hookRefreshLine(result, scope) ?? `${path}: run \`${command}\`.`,
      };
  }
}

/** The NODE and HOOK an opencode shim runs, or null when it is not Prism's. */
export function readOpencodeShim(
  text: string,
): { node: string; hook: string } | null {
  if (!text.startsWith("// Managed by `prism install opencode`")) return null;
  const value = (name: string): string | null => {
    const match = new RegExp(`^const ${name} = (".*");$`, "m").exec(text);
    if (!match) return null;
    try {
      return JSON.parse(match[1]!) as string;
    } catch {
      return null;
    }
  };
  const node = value("NODE");
  const hook = value("HOOK");
  return node && hook ? { node, hook } : null;
}

/**
 * opencode runs the hook through a plugin shim. The hook's own changes reach
 * it with no rewrite (the shim runs the pack's prism-hook.mjs by path); only
 * a shim that differs from what this release writes needs a reinstall.
 */
export function opencodeHookCheck(path: string): HookCheck {
  const fix = "Run `prism install opencode`.";
  if (!existsSync(path))
    return {
      label: "Hooks",
      status: "warn",
      detail: `opencode plugin ${path} is missing. ${fix}`,
    };
  const text = readFileSync(path, "utf8");
  const shim = readOpencodeShim(text);
  if (!shim)
    return {
      label: "Hooks",
      status: "warn",
      detail: `opencode plugin ${path} was changed by hand. ${fix}`,
    };
  if (!existsSync(shim.hook))
    return {
      label: "Hooks",
      status: "warn",
      detail: `opencode plugin runs ${shim.hook}, which is gone. ${fix}`,
    };
  const expected = opencodeShim({
    node: shim.node,
    pack: dirname(dirname(shim.hook)),
  });
  return expected === text
    ? {
        label: "Hooks",
        status: "ok",
        detail: `opencode plugin matches this release (${path})`,
      }
    : {
        label: "Hooks",
        status: "warn",
        detail: `opencode plugin ${path} is from another release. ${fix}`,
      };
}

/** One check per hook config the install record lists. */
export function hookConfigChecks(
  record: InstallRecord,
  options: { readonly home?: string } = {},
): HookCheck[] {
  const checks: HookCheck[] = [];
  for (const file of record.files ?? []) {
    if (file.kind === "claude-hooks")
      checks.push(claudeHookCheck(file.path, options));
    else if (
      file.kind === "file" &&
      /[\\/]plugins[\\/]prism\.js$/.test(file.path)
    )
      checks.push(opencodeHookCheck(file.path));
  }
  return checks;
}
