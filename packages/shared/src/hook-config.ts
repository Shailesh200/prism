/**
 * Prism's Claude Code hook entries, in one place (round 4, hook upgrades).
 *
 * `prism install` writes them; the session hook and `prism doctor` compare
 * what a settings file holds with what this release writes. A config that
 * matches a plan an earlier release wrote is updated in place, keeping its
 * paths and every hook that is not Prism's, after a backup. Anything else (a
 * hand-edited Prism entry, Prism hooks run from two places, a hook file that
 * is gone, a file that is not JSON) is left alone and the caller prints the
 * exact command that fixes it.
 *
 * No dependencies beyond node: `gen:prompt-hook` bundles this file into
 * `packages/plugin/hooks/hook-config.mjs` for the hook process.
 */
import { createHash } from "node:crypto";
import { userInfo } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";

/** The hook script every Prism entry runs. */
export const PRISM_HOOK_FILE = "prism-hook.mjs";

/** The edit tools the before- and after-edit hooks watch. */
export const EDIT_MATCHER = "Write|Edit|NotebookEdit";

export type HookStep = {
  /** The hook subcommand, the last word of the command. */
  readonly event: string;
  readonly timeout: number;
  readonly asyncRewake?: true;
};

export type HookGroup = {
  /** The Claude Code hook event (`Stop`, `PreToolUse`, ...). */
  readonly on: string;
  readonly matcher?: string;
  readonly steps: readonly HookStep[];
};

/** The release whose plan is CLAUDE_HOOK_PLAN. */
export const CLAUDE_HOOKS_VERSION = "2.0.0";

/** What this release registers with Claude Code. */
export const CLAUDE_HOOK_PLAN: readonly HookGroup[] = [
  { on: "SessionStart", steps: [{ event: "session", timeout: 5 }] },
  { on: "UserPromptSubmit", steps: [{ event: "prompt", timeout: 8 }] },
  {
    on: "PreToolUse",
    matcher: EDIT_MATCHER,
    steps: [{ event: "before-edit", timeout: 5 }],
  },
  {
    on: "PostToolUse",
    matcher: EDIT_MATCHER,
    steps: [{ event: "after-edit", timeout: 5 }],
  },
  // `stop` shows the receipt inside its 1 s budget. `stop-wait` runs in the
  // background (asyncRewake): when checks still running at stop finish, it
  // exits 2 and Claude Code wakes the agent with the verdict, same session.
  {
    on: "Stop",
    steps: [
      { event: "stop", timeout: 120 },
      { event: "stop-wait", timeout: 120, asyncRewake: true },
    ],
  },
];

/**
 * Plans earlier releases wrote, by the version that wrote them. Only a config
 * that matches one of these exactly is rewritten without asking. Add the old
 * plan here whenever CLAUDE_HOOK_PLAN changes.
 */
export const EARLIER_CLAUDE_HOOK_PLANS: Readonly<
  Record<string, readonly HookGroup[]>
> = {
  // 2.0.0 before the session-end verdict: one Stop hook.
  "2.0.0-pre": CLAUDE_HOOK_PLAN.map((group) =>
    group.on === "Stop"
      ? { on: "Stop", steps: [{ event: "stop", timeout: 120 }] }
      : group,
  ),
};

/** A short, path-free fingerprint of a plan. */
export function planHash(plan: readonly HookGroup[]): string {
  const canonical = plan
    .map((group) => ({
      on: group.on,
      matcher: group.matcher ?? null,
      steps: group.steps.map((step) => ({
        event: step.event,
        timeout: step.timeout,
        asyncRewake: step.asyncRewake === true,
        ...("extra" in step
          ? { extra: (step as { extra: string }).extra }
          : {}),
      })),
    }))
    .sort((a, b) =>
      `${a.on}|${a.matcher}`.localeCompare(`${b.on}|${b.matcher}`),
    );
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 12);
}

export type HookEntry = {
  matcher?: string;
  hooks: Record<string, unknown>[];
};

function isPrismHook(hook: unknown): hook is Record<string, unknown> {
  return (
    !!hook &&
    typeof hook === "object" &&
    typeof (hook as { command?: unknown }).command === "string" &&
    (hook as { command: string }).command.includes(PRISM_HOOK_FILE)
  );
}

/** `hooks` from a settings file with every Prism hook taken out. */
export function stripPrismHooks(value: unknown): Record<string, HookEntry[]> {
  const out: Record<string, HookEntry[]> = {};
  if (!value || typeof value !== "object") return out;
  for (const [event, entries] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!Array.isArray(entries)) continue;
    const kept = entries
      .map((entry: HookEntry) => ({
        ...entry,
        hooks: (entry?.hooks ?? []).filter((hook) => !isPrismHook(hook)),
      }))
      .filter((entry) => entry.hooks.length > 0);
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}

/** The entries for `plan`, each command `<launcher> <event>`. */
export function claudeHookEntries(
  launcher: string,
  plan: readonly HookGroup[] = CLAUDE_HOOK_PLAN,
): Record<string, HookEntry[]> {
  const out: Record<string, HookEntry[]> = {};
  for (const group of plan) {
    const entry: HookEntry = {
      ...(group.matcher ? { matcher: group.matcher } : {}),
      hooks: group.steps.map((step) => ({
        type: "command",
        command: `${launcher} ${step.event}`,
        timeout: step.timeout,
        ...(step.asyncRewake ? { asyncRewake: true } : {}),
      })),
    };
    out[group.on] = [...(out[group.on] ?? []), entry];
  }
  return out;
}

/** The user's hooks, then this release's Prism entries. */
export function mergeClaudeHooks(
  hooks: unknown,
  launcher: string,
): Record<string, HookEntry[]> {
  const merged = stripPrismHooks(hooks);
  for (const [on, entries] of Object.entries(claudeHookEntries(launcher))) {
    merged[on] = [...(merged[on] ?? []), ...entries];
  }
  return merged;
}

const KNOWN_KEYS = new Set(["type", "command", "timeout", "asyncRewake"]);

export type HookInspection =
  | { readonly state: "absent" }
  | { readonly state: "current"; readonly launcher: string }
  | {
      readonly state: "outdated";
      readonly from: string;
      readonly launcher: string;
    }
  | { readonly state: "edited"; readonly reason: string };

/** What the Prism part of a settings `hooks` object is. Pure. */
export function inspectClaudeHooks(hooks: unknown): HookInspection {
  if (!hooks || typeof hooks !== "object") return { state: "absent" };
  const groups: (HookGroup & { steps: (HookStep & { extra?: string })[] })[] =
    [];
  const launchers = new Set<string>();
  let shared = false;
  for (const [on, entries] of Object.entries(
    hooks as Record<string, unknown>,
  )) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries as HookEntry[]) {
      const list = Array.isArray(entry?.hooks) ? entry.hooks : [];
      const mine = list.filter(isPrismHook);
      if (mine.length === 0) continue;
      if (mine.length !== list.length) shared = true;
      groups.push({
        on,
        ...(typeof entry.matcher === "string" && entry.matcher
          ? { matcher: entry.matcher }
          : {}),
        steps: mine.map((hook) => {
          const command = String(hook.command).trim();
          const cut = command.lastIndexOf(" ");
          launchers.add(cut > 0 ? command.slice(0, cut).trim() : "");
          const extra = Object.keys(hook)
            .filter((key) => !KNOWN_KEYS.has(key))
            .sort()
            .join(",");
          return {
            event: cut > 0 ? command.slice(cut + 1) : command,
            timeout: typeof hook.timeout === "number" ? hook.timeout : -1,
            ...(hook.asyncRewake === true
              ? { asyncRewake: true as const }
              : {}),
            ...(extra || hook.type !== "command"
              ? { extra: extra || "type" }
              : {}),
          };
        }),
      });
    }
  }
  if (groups.length === 0) return { state: "absent" };
  if (shared)
    return {
      state: "edited",
      reason: "a Prism hook shares an entry with another hook",
    };
  const [launcher = ""] = launchers;
  if (launchers.size !== 1 || !launcher)
    return {
      state: "edited",
      reason: "Prism's hooks run from more than one place",
    };
  const hash = planHash(groups);
  if (hash === planHash(CLAUDE_HOOK_PLAN))
    return { state: "current", launcher };
  for (const [from, plan] of Object.entries(EARLIER_CLAUDE_HOOK_PLANS)) {
    if (hash === planHash(plan)) return { state: "outdated", from, launcher };
  }
  return {
    state: "edited",
    reason: "Prism's hook entries were changed by hand",
  };
}

/** `"<node>" "<hook>"` back into its two paths, or null. */
export function parseLauncher(
  launcher: string,
): { node: string; hook: string } | null {
  const quoted = /^"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"$/.exec(launcher);
  if (!quoted) return null;
  return { node: unquote(quoted[1]!), hook: unquote(quoted[2]!) };
}

function unquote(text: string): string {
  return text.replace(/\\"/g, '"');
}

export type HookRefresh =
  | { readonly kind: "absent" | "current" | "other-pack" | "guarded" }
  | {
      readonly kind: "updated";
      readonly from: string;
      readonly backup: string;
    }
  | { readonly kind: "outdated"; readonly from: string }
  | { readonly kind: "manual"; readonly reason: string };

function same(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
}

/** `path` with every symlink resolved, also for a file not created yet. */
function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(realPath(parent), basename(path));
  }
}

/**
 * True when `settingsPath` is inside the real OS user's `~/.claude` (from
 * the account, not `$HOME`, so a changed HOME cannot point past it).
 */
export function isRealUserClaude(
  settingsPath: string,
  realHome: string = userInfo().homedir,
): boolean {
  const target = realPath(resolve(settingsPath));
  const guarded = realPath(join(realHome, ".claude"));
  return target === guarded || target.startsWith(guarded + sep);
}

/**
 * Bring one Claude Code settings file up to this release's plan, when that
 * is safe. `onlyHook`: touch it only when its Prism hooks run that file (the
 * session hook passes itself). `dryRun`: report, write nothing.
 *
 * Guard (for now): the real user's own `~/.claude` is never read or written
 * here, only isolated homes (tests, benches). `prism install claude` still
 * updates it when the user runs it. Lifting this needs Shailesh's OK.
 */
export function refreshClaudeHooks(
  settingsPath: string,
  options: {
    readonly onlyHook?: string;
    readonly dryRun?: boolean;
    /** The real user's home; tests pass a stand-in. */
    readonly realHome?: string;
  } = {},
): HookRefresh {
  if (isRealUserClaude(settingsPath, options.realHome))
    return { kind: "guarded" };
  if (!existsSync(settingsPath)) return { kind: "absent" };
  let text: string;
  let settings: Record<string, unknown>;
  try {
    text = readFileSync(settingsPath, "utf8");
    const raw: unknown = text.trim() === "" ? {} : JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return { kind: "manual", reason: "settings.json is not a JSON object" };
    settings = raw as Record<string, unknown>;
  } catch {
    return { kind: "manual", reason: "settings.json is not valid JSON" };
  }
  const seen = inspectClaudeHooks(settings.hooks);
  if (seen.state === "absent") return { kind: "absent" };
  if (seen.state === "edited") return { kind: "manual", reason: seen.reason };
  const paths = parseLauncher(seen.launcher);
  if (options.onlyHook && (!paths || !same(paths.hook, options.onlyHook)))
    return { kind: "other-pack" };
  if (seen.state === "current") return { kind: "current" };
  if (!paths)
    return {
      kind: "manual",
      reason: "Prism's hook command was changed by hand",
    };
  if (!existsSync(paths.hook))
    return { kind: "manual", reason: `the hook file ${paths.hook} is gone` };
  if (!existsSync(paths.node))
    return { kind: "manual", reason: `the Node binary ${paths.node} is gone` };
  if (options.dryRun) return { kind: "outdated", from: seen.from };
  const backup = `${settingsPath}.prism-backup-${seen.from}`;
  try {
    if (!existsSync(backup)) writeFileSync(backup, text);
    const next = {
      ...settings,
      hooks: mergeClaudeHooks(settings.hooks, seen.launcher),
    };
    const tmp = `${settingsPath}.prism-${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(tmp, settingsPath);
  } catch (error) {
    return {
      kind: "manual",
      reason: `could not write it (${error instanceof Error ? error.message : String(error)})`,
    };
  }
  return { kind: "updated", from: seen.from, backup };
}

/** The command that rewrites one settings file's Prism hooks by hand. */
export function claudeInstallCommand(scope: "user" | "project"): string {
  return scope === "project"
    ? "prism install claude --project"
    : "prism install claude";
}

/** The one line a user sees for a refresh result, or null for nothing to say. */
export function hookRefreshLine(
  refresh: HookRefresh,
  scope: "user" | "project",
): string | null {
  switch (refresh.kind) {
    case "updated":
      return `Prism updated its Claude Code hooks to ${CLAUDE_HOOKS_VERSION} (backup ${refresh.backup}); they apply from the next session.`;
    case "outdated":
      return `Prism's Claude Code hooks are from ${refresh.from}; the next Claude Code session updates them, or run \`prism doctor --fix\` now.`;
    case "manual":
      return `Prism's Claude Code hooks are out of date and were not changed: ${refresh.reason}. Run \`${claudeInstallCommand(scope)}\`.`;
    default:
      return null;
  }
}
