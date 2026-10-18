/**
 * Keeps every test run off the real home directory.
 *
 * Prism's install, start, upgrade and doctor --fix write agent configs under
 * HOME (~/.claude, ~/.cursor, ~/.codex, ~/.config/opencode) and its own data
 * under PRISM_HOME. A test that spawns the CLI or a hook with the developer's
 * HOME rewrites their real setup (it happened once, 2026-10-17). So:
 *
 * - The default export is a vitest `globalSetup`. It runs before any worker
 *   starts; when HOME or PRISM_HOME is unset or points into the real home, it
 *   moves both to a fresh temp folder, and the workers inherit that.
 * - `home-guard-setup.ts` (vitest `setupFiles`) runs in every worker and
 *   throws if HOME or PRISM_HOME is unset or inside the real home.
 *
 * - The real paths of HOME, PRISM_HOME and XDG_CONFIG_HOME (opencode, when
 *   set) must be inside the temp folder and outside the real home. Shared's
 *   prism-home sends Prism data to $TMPDIR under vitest, but agent configs
 *   follow HOME, so HOME is checked on its own.
 * - When the run ends, the real home's agent config files must have the same
 *   modification times as when it started (a read-only stat, never a read).
 *
 * Every vitest config in the repo lists both, so CI runs them too.
 */
import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

/** The real user's home from the passwd entry, which HOME cannot change. */
export function realUserHome(): string {
  try {
    return userInfo().homedir;
  } catch {
    return "";
  }
}

/** The real path of `path`, or of its nearest existing parent plus the rest. */
function realPath(path: string): string {
  const full = resolve(path);
  try {
    return realpathSync(full);
  } catch {
    const parent = dirname(full);
    return parent === full ? full : join(realPath(parent), basename(full));
  }
}

/** True when `path` is `root` or inside it (symlinks resolved). */
export function isInside(path: string, root: string): boolean {
  if (!root) return false;
  const rel = relative(realPath(root), realPath(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Why the env is unsafe for tests, or undefined when it is safe (Arc): the
 * real paths of HOME and PRISM_HOME (and XDG_CONFIG_HOME when set) must each
 * be inside realpath(os.tmpdir()) and not inside realpath(os.userInfo().homedir).
 * No fixed folder: each run or test keeps its own temp `.prism`.
 */
export function homeProblem(
  env: NodeJS.ProcessEnv = process.env,
  realHome: string = realUserHome(),
  temp: string = tmpdir(),
): string | undefined {
  const keys = ["HOME", "PRISM_HOME", "XDG_CONFIG_HOME"] as const;
  for (const key of keys) {
    const value = env[key];
    if (value === undefined || value === "") {
      if (key === "XDG_CONFIG_HOME") continue;
      return `${key} is unset`;
    }
    if (isInside(value, realHome))
      return `${key}=${value} resolves into the real home (${realHome})`;
    if (!isInside(value, temp))
      return `${key}=${value} is not inside the temp folder (${realPath(temp)})`;
  }
  return undefined;
}

/** Agent config files Prism writes in a home (checked by stat only). */
export const AGENT_CONFIG_FILES = [
  ".claude.json",
  ".claude/settings.json",
  ".cursor/mcp.json",
  ".codex/config.toml",
  ".codex/AGENTS.md",
  ".config/opencode/opencode.json",
  ".config/opencode/plugins/prism.js",
  ".config/opencode/AGENTS.md",
  ".prism/config.json",
  ".prism/install.json",
];

/** Modification time of each agent config in `home` (missing: -1). Never reads content. */
export function configTimes(home: string): Record<string, number> {
  const times: Record<string, number> = {};
  for (const file of AGENT_CONFIG_FILES) {
    try {
      times[file] = statSync(join(home, file)).mtimeMs;
    } catch {
      times[file] = -1;
    }
  }
  return times;
}

/** The files whose modification time differs between two `configTimes`. */
export function changedConfigs(
  before: Record<string, number>,
  after: Record<string, number>,
): string[] {
  return Object.keys(before).filter((file) => before[file] !== after[file]);
}

/** Throws unless HOME and PRISM_HOME are throwaway folders. */
export function assertIsolatedHome(env: NodeJS.ProcessEnv = process.env): void {
  const problem = homeProblem(env);
  if (problem)
    throw new Error(
      `Refusing to run tests: ${problem}. Tests must use a throwaway HOME and PRISM_HOME so they never write the real agent configs (packages/test-support/src/home-guard.ts).`,
    );
}

/** vitest globalSetup: give the whole run a throwaway HOME, then check it. */
export default function setup(): () => void {
  let created: string | undefined;
  if (homeProblem()) {
    created = mkdtempSync(join(tmpdir(), "prism-test-home-"));
    process.env.HOME = created;
    // os.homedir() reads USERPROFILE on Windows.
    process.env.USERPROFILE = created;
    process.env.PRISM_HOME = join(created, ".prism");
  }
  process.env.XDG_CONFIG_HOME = join(process.env.HOME ?? "", ".config");
  assertIsolatedHome();
  const realHome = realUserHome();
  const before = realHome ? configTimes(realHome) : {};
  return () => {
    if (created) rmSync(created, { recursive: true, force: true });
    if (!realHome) return;
    const changed = changedConfigs(before, configTimes(realHome));
    if (changed.length > 0)
      throw new Error(
        `The real home's agent configs changed during this test run: ${changed.map((file) => `~/${file}`).join(", ")}. A test wrote outside its throwaway HOME (or an agent running at the same time did).`,
      );
  };
}
