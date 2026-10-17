/**
 * Dependency-free copy of `@repo-prism/shared/hook-config` for the hook, so
 * the session hook can bring an old Prism hook config up to date. Generated
 * from packages/shared/src/hook-config.ts by `bun run gen:prompt-hook`
 * (packages/plugin); `hook-config.contract.test.ts` holds the two to the
 * same answers. Do not edit by hand: regenerate.
 */
// ../shared/src/hook-config.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
var PRISM_HOOK_FILE = "prism-hook.mjs";
var EDIT_MATCHER = "Write|Edit|NotebookEdit";
var CLAUDE_HOOKS_VERSION = "2.0.0";
var CLAUDE_HOOK_PLAN = [
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
  {
    on: "Stop",
    steps: [
      { event: "stop", timeout: 120 },
      { event: "stop-wait", timeout: 120, asyncRewake: true },
    ],
  },
];
var EARLIER_CLAUDE_HOOK_PLANS = {
  "2.0.0-pre": CLAUDE_HOOK_PLAN.map((group) =>
    group.on === "Stop"
      ? { on: "Stop", steps: [{ event: "stop", timeout: 120 }] }
      : group,
  ),
};
function planHash(plan) {
  const canonical = plan
    .map((group) => ({
      on: group.on,
      matcher: group.matcher ?? null,
      steps: group.steps.map((step) => ({
        event: step.event,
        timeout: step.timeout,
        asyncRewake: step.asyncRewake === true,
        ...("extra" in step ? { extra: step.extra } : {}),
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
function isPrismHook(hook) {
  return (
    !!hook &&
    typeof hook === "object" &&
    typeof hook.command === "string" &&
    hook.command.includes(PRISM_HOOK_FILE)
  );
}
function stripPrismHooks(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;
  for (const [event, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    const kept = entries
      .map((entry) => ({
        ...entry,
        hooks: (entry?.hooks ?? []).filter((hook) => !isPrismHook(hook)),
      }))
      .filter((entry) => entry.hooks.length > 0);
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}
function claudeHookEntries(launcher, plan = CLAUDE_HOOK_PLAN) {
  const out = {};
  for (const group of plan) {
    const entry = {
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
function mergeClaudeHooks(hooks, launcher) {
  const merged = stripPrismHooks(hooks);
  for (const [on, entries] of Object.entries(claudeHookEntries(launcher))) {
    merged[on] = [...(merged[on] ?? []), ...entries];
  }
  return merged;
}
var KNOWN_KEYS = new Set(["type", "command", "timeout", "asyncRewake"]);
function inspectClaudeHooks(hooks) {
  if (!hooks || typeof hooks !== "object") return { state: "absent" };
  const groups = [];
  const launchers = new Set();
  let shared = false;
  for (const [on, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
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
            ...(hook.asyncRewake === true ? { asyncRewake: true } : {}),
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
function parseLauncher(launcher) {
  const quoted = /^"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"$/.exec(launcher);
  if (!quoted) return null;
  return { node: unquote(quoted[1]), hook: unquote(quoted[2]) };
}
function unquote(text) {
  return text.replace(/\\"/g, '"');
}
function same(a, b) {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
}
function checkClaudeHooks(settingsPath, options = {}) {
  if (!existsSync(settingsPath)) return { kind: "absent" };
  let settings;
  try {
    const text = readFileSync(settingsPath, "utf8");
    const raw = text.trim() === "" ? {} : JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return { kind: "manual", reason: "settings.json is not a JSON object" };
    settings = raw;
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
  return { kind: "outdated", from: seen.from };
}
function claudeInstallCommand(scope) {
  return scope === "project"
    ? "prism install claude --project"
    : "prism install claude";
}
function hookRefreshLine(refresh, scope) {
  switch (refresh.kind) {
    case "outdated":
      return "Prism's Claude Code hooks are out of date. Run prism doctor --fix to update them.";
    case "manual":
      return `Prism's Claude Code hooks are out of date and were not changed: ${refresh.reason}. Run \`${claudeInstallCommand(scope)}\`.`;
    default:
      return null;
  }
}
export {
  stripPrismHooks,
  planHash,
  parseLauncher,
  mergeClaudeHooks,
  inspectClaudeHooks,
  hookRefreshLine,
  claudeInstallCommand,
  claudeHookEntries,
  checkClaudeHooks,
  PRISM_HOOK_FILE,
  EDIT_MATCHER,
  EARLIER_CLAUDE_HOOK_PLANS,
  CLAUDE_HOOK_PLAN,
  CLAUDE_HOOKS_VERSION,
};
