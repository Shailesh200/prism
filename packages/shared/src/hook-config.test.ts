import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLAUDE_HOOK_PLAN,
  claudeHookEntries,
  EARLIER_CLAUDE_HOOK_PLANS,
  hookRefreshLine,
  inspectClaudeHooks,
  isRealUserClaude,
  mergeClaudeHooks,
  parseLauncher,
  planHash,
  refreshClaudeHooks,
} from "./hook-config.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A pack with a real hook file, and the launcher `prism install` writes for it. */
function pack(): { dir: string; hook: string; launcher: string } {
  const dir = mkdtempSync(join(tmpdir(), "prism-hook-config-"));
  dirs.push(dir);
  const hook = join(dir, "hooks", "prism-hook.mjs");
  mkdirSync(join(dir, "hooks"), { recursive: true });
  writeFileSync(hook, "");
  return { dir, hook, launcher: `"${process.execPath}" "${hook}"` };
}

const USER_HOOKS = {
  Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
  PreToolUse: [
    { matcher: "Bash", hooks: [{ type: "command", command: "guard.sh" }] },
  ],
};

function settingsWith(dir: string, hooks: unknown, extra = {}): string {
  const path = join(dir, "settings.json");
  writeFileSync(
    path,
    `${JSON.stringify({ theme: "dark", ...extra, hooks }, null, 2)}\n`,
  );
  return path;
}

const oldPlan = EARLIER_CLAUDE_HOOK_PLANS["2.0.0-pre"]!;

/** The user's hooks with an earlier release's Prism entries after them. */
function withOldPrism(launcher: string): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = structuredClone(USER_HOOKS);
  for (const [on, entries] of Object.entries(
    claudeHookEntries(launcher, oldPlan),
  )) {
    out[on] = [...(out[on] ?? []), ...entries];
  }
  return out;
}

describe("hook config plan (round 4)", () => {
  it("this release's plan has the background stop-wait; the earlier one does not", () => {
    const stop = CLAUDE_HOOK_PLAN.find((g) => g.on === "Stop")!;
    expect(stop.steps).toEqual([
      { event: "stop", timeout: 120 },
      { event: "stop-wait", timeout: 120, asyncRewake: true },
    ]);
    expect(planHash(oldPlan)).not.toBe(planHash(CLAUDE_HOOK_PLAN));
  });

  it("reads back what it writes, next to the user's own hooks", () => {
    const { launcher } = pack();
    const hooks = mergeClaudeHooks(USER_HOOKS, launcher);
    expect(inspectClaudeHooks(hooks)).toEqual({ state: "current", launcher });
    expect(hooks.Stop?.[0]).toEqual(USER_HOOKS.Stop[0]);
    expect(hooks.PreToolUse?.[0]).toEqual(USER_HOOKS.PreToolUse[0]);
    expect(parseLauncher(launcher)?.node).toBe(process.execPath);
  });

  it("knows a plan an earlier release wrote", () => {
    const { launcher } = pack();
    const old = withOldPrism(launcher);
    expect(inspectClaudeHooks(old)).toEqual({
      state: "outdated",
      from: "2.0.0-pre",
      launcher,
    });
  });

  it("treats anything else as hand-edited, and says what", () => {
    const { launcher } = pack();
    const entries = () => claudeHookEntries(launcher, oldPlan);
    const timeout = entries();
    timeout.Stop![0]!.hooks[0]!.timeout = 300;
    expect(inspectClaudeHooks(timeout)).toMatchObject({
      state: "edited",
      reason: "Prism's hook entries were changed by hand",
    });
    const extra = entries();
    extra.Stop![0]!.hooks[0]!.statusMessage = "receipt";
    expect(inspectClaudeHooks(extra).state).toBe("edited");
    const shared = entries();
    shared.Stop![0]!.hooks.push({ type: "command", command: "say done" });
    expect(inspectClaudeHooks(shared)).toMatchObject({
      reason: "a Prism hook shares an entry with another hook",
    });
    const twoPlaces = entries();
    twoPlaces.Stop![0]!.hooks[0]!.command = `"node" "/elsewhere/prism-hook.mjs" stop`;
    expect(inspectClaudeHooks(twoPlaces)).toMatchObject({
      reason: "Prism's hooks run from more than one place",
    });
    expect(inspectClaudeHooks(USER_HOOKS)).toEqual({ state: "absent" });
    expect(inspectClaudeHooks(undefined)).toEqual({ state: "absent" });
  });
});

describe("real-home guard (Atlas, round 4)", () => {
  it("never touches the real OS user's ~/.claude, whatever $HOME says", () => {
    const real = join(userInfo().homedir, ".claude", "settings.json");
    expect(isRealUserClaude(real)).toBe(true);
    expect(refreshClaudeHooks(real)).toEqual({ kind: "guarded" });
    expect(refreshClaudeHooks(real, { dryRun: true })).toEqual({
      kind: "guarded",
    });
    expect(hookRefreshLine({ kind: "guarded" }, "user")).toBeNull();
  });

  it("skips a stand-in real home, and a path that symlinks into it", () => {
    const { dir, launcher } = pack();
    const realHome = join(dir, "real-home");
    mkdirSync(join(realHome, ".claude"), { recursive: true });
    const path = join(realHome, ".claude", "settings.json");
    writeFileSync(
      path,
      JSON.stringify({ hooks: claudeHookEntries(launcher, oldPlan) }),
    );
    const before = readFileSync(path, "utf8");
    expect(refreshClaudeHooks(path, { realHome })).toEqual({ kind: "guarded" });

    const isolated = join(dir, "isolated-home");
    mkdirSync(isolated);
    symlinkSync(join(realHome, ".claude"), join(isolated, ".claude"));
    expect(
      refreshClaudeHooks(join(isolated, ".claude", "settings.json"), {
        realHome,
      }),
    ).toEqual({ kind: "guarded" });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(existsSync(`${path}.prism-backup-2.0.0-pre`)).toBe(false);
  });

  it("an isolated HOME (not the real user's) is still updated", () => {
    const { dir, launcher } = pack();
    const path = settingsWith(dir, withOldPrism(launcher));
    expect(
      refreshClaudeHooks(path, { realHome: join(dir, "real-home") }),
    ).toMatchObject({
      kind: "updated",
    });
  });
});

describe("refreshClaudeHooks", () => {
  it("updates an earlier plan in place: backup, the user's hooks and keys kept, idempotent", () => {
    const { dir, launcher } = pack();
    const path = settingsWith(dir, withOldPrism(launcher));
    const before = readFileSync(path, "utf8");

    expect(refreshClaudeHooks(path, { dryRun: true })).toEqual({
      kind: "outdated",
      from: "2.0.0-pre",
    });
    expect(readFileSync(path, "utf8")).toBe(before);

    const result = refreshClaudeHooks(path);
    expect(result).toEqual({
      kind: "updated",
      from: "2.0.0-pre",
      backup: `${path}.prism-backup-2.0.0-pre`,
    });
    expect(readFileSync(`${path}.prism-backup-2.0.0-pre`, "utf8")).toBe(before);
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.theme).toBe("dark");
    expect(after.hooks).toEqual(mergeClaudeHooks(USER_HOOKS, launcher));
    expect(inspectClaudeHooks(after.hooks)).toEqual({
      state: "current",
      launcher,
    });

    // Second run: nothing to do, nothing written, the backup untouched.
    const text = readFileSync(path, "utf8");
    expect(refreshClaudeHooks(path)).toEqual({ kind: "current" });
    expect(readFileSync(path, "utf8")).toBe(text);
    expect(readFileSync(`${path}.prism-backup-2.0.0-pre`, "utf8")).toBe(before);
  });

  it("never rewrites what it cannot vouch for", () => {
    const { dir, hook, launcher } = pack();
    const edited = claudeHookEntries(launcher, oldPlan);
    edited.Stop![0]!.hooks[0]!.timeout = 30;
    const path = settingsWith(dir, edited);
    const before = readFileSync(path, "utf8");
    expect(refreshClaudeHooks(path)).toMatchObject({ kind: "manual" });
    expect(readFileSync(path, "utf8")).toBe(before);

    writeFileSync(path, "{ not json");
    expect(refreshClaudeHooks(path)).toEqual({
      kind: "manual",
      reason: "settings.json is not valid JSON",
    });
    expect(readFileSync(path, "utf8")).toBe("{ not json");

    settingsWith(dir, claudeHookEntries(launcher, oldPlan));
    rmSync(hook);
    expect(refreshClaudeHooks(path)).toEqual({
      kind: "manual",
      reason: `the hook file ${hook} is gone`,
    });
    expect(existsSync(`${path}.prism-backup-2.0.0-pre`)).toBe(false);
  });

  it("with onlyHook, leaves a file whose Prism hooks run another pack", () => {
    const { dir, launcher } = pack();
    const path = settingsWith(dir, claudeHookEntries(launcher, oldPlan));
    const before = readFileSync(path, "utf8");
    expect(
      refreshClaudeHooks(path, { onlyHook: "/other/prism-hook.mjs" }),
    ).toEqual({
      kind: "other-pack",
    });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(refreshClaudeHooks(join(dir, "none.json"))).toEqual({
      kind: "absent",
    });
  });

  it("each outcome is one line, and a manual one names the exact command", () => {
    expect(hookRefreshLine({ kind: "manual", reason: "x" }, "project")).toBe(
      "Prism's Claude Code hooks are out of date and were not changed: x. Run `prism install claude --project`.",
    );
    expect(hookRefreshLine({ kind: "manual", reason: "x" }, "user")).toContain(
      "Run `prism install claude`.",
    );
    expect(
      hookRefreshLine(
        { kind: "updated", from: "2.0.0-pre", backup: "/b" },
        "user",
      ),
    ).toMatch(/^Prism updated its Claude Code hooks to 2\.0\.0 \(backup \/b\)/);
    expect(hookRefreshLine({ kind: "current" }, "user")).toBeNull();
    expect(hookRefreshLine({ kind: "other-pack" }, "user")).toBeNull();
  });
});
