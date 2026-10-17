import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeHooks } from "@repo-prism/plugin";
import {
  CLAUDE_HOOK_PLAN,
  claudeHookEntries,
  EARLIER_CLAUDE_HOOK_PLANS,
  inspectClaudeHooks,
} from "@repo-prism/shared/hook-config";
import type { InstallRecord } from "@repo-prism/shared/prism-bin";
import { afterEach, describe, expect, it } from "vitest";
import {
  claudeHookCheck,
  hookConfigChecks,
  opencodeHookCheck,
  readOpencodeShim,
} from "./hook-health.js";
import { installHost, type InstallHost } from "./hosts.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "prism-hook-health-"));
  dirs.push(dir);
  return dir;
}

function target(host: InstallHost) {
  const pack = temp();
  mkdirSync(join(pack, "hooks"), { recursive: true });
  writeFileSync(join(pack, "hooks", "prism-hook.mjs"), "");
  return {
    host,
    scope: "user" as const,
    home: temp(),
    root: temp(),
    node: process.execPath,
    bin: "/opt/prism/bin.js",
    pack,
  };
}

describe("hook plan contract (round 4)", () => {
  it("the Claude plugin's hooks.json registers the same hooks as prism install", () => {
    const plugin = claudeHooks().hooks as Record<
      string,
      {
        matcher?: string;
        hooks: { args: string[]; timeout: number; asyncRewake?: boolean }[];
      }[]
    >;
    const groups = Object.entries(plugin).flatMap(([on, entries]) =>
      entries.map((entry) => ({
        on,
        ...(entry.matcher ? { matcher: entry.matcher } : {}),
        steps: entry.hooks.map((hook) => ({
          event: hook.args[1],
          timeout: hook.timeout,
          ...(hook.asyncRewake ? { asyncRewake: true } : {}),
        })),
      })),
    );
    expect(groups).toEqual(CLAUDE_HOOK_PLAN);
  });
});

describe("prism doctor hook checks (round 4)", () => {
  it("claude: current after install; an earlier plan warns, and --fix updates it", () => {
    const t = target("claude");
    installHost(t);
    const settings = join(t.home, ".claude", "settings.json");
    expect(
      claudeHookCheck(settings, { fix: false, home: t.home }),
    ).toMatchObject({
      status: "ok",
      detail: expect.stringContaining("match 2.0.0"),
    });

    // What 2.0.0 wrote before the session-end verdict, beside a user hook.
    const launcher = `"${t.node}" "${join(t.pack, "hooks", "prism-hook.mjs")}"`;
    const old = claudeHookEntries(
      launcher,
      EARLIER_CLAUDE_HOOK_PLANS["2.0.0-pre"]!,
    );
    old.Stop!.unshift({ hooks: [{ type: "command", command: "say done" }] });
    writeFileSync(settings, JSON.stringify({ hooks: old }));
    const warned = claudeHookCheck(settings, { fix: false, home: t.home });
    expect(warned.status).toBe("warn");
    expect(warned.detail).toContain("prism doctor --fix");
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({ hooks: old });

    const fixed = claudeHookCheck(settings, { fix: true, home: t.home });
    expect(fixed.status).toBe("ok");
    expect(fixed.detail).toContain("Prism updated its Claude Code hooks");
    const hooks = JSON.parse(readFileSync(settings, "utf8")).hooks;
    expect(inspectClaudeHooks(hooks).state).toBe("current");
    expect(hooks.Stop[0]).toEqual({
      hooks: [{ type: "command", command: "say done" }],
    });
  });

  it("claude: doctor --fix leaves the real user's ~/.claude alone", () => {
    const t = target("claude");
    installHost(t);
    const settings = join(t.home, ".claude", "settings.json");
    const before = readFileSync(settings, "utf8");
    // This test's home stands in for the real OS user's home.
    const check = claudeHookCheck(settings, {
      fix: true,
      home: t.home,
      realHome: t.home,
    });
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("does not auto-update your own ~/.claude");
    expect(readFileSync(settings, "utf8")).toBe(before);
  });

  it("claude: a hand-edited entry is left alone and the warning names the command", () => {
    const t = target("claude");
    installHost(t);
    const settings = join(t.home, ".claude", "settings.json");
    const written = JSON.parse(readFileSync(settings, "utf8"));
    written.hooks.Stop[0].hooks[0].timeout = 30;
    writeFileSync(settings, JSON.stringify(written));
    const before = readFileSync(settings, "utf8");
    const check = claudeHookCheck(settings, { fix: true, home: t.home });
    expect(check).toMatchObject({ status: "warn" });
    expect(check.detail).toContain("Run `prism install claude`.");
    expect(readFileSync(settings, "utf8")).toBe(before);
    // A repository's settings file gets the --project command.
    const project = claudeHookCheck(settings, { fix: false, home: temp() });
    expect(project.detail).toContain("Run `prism install claude --project`.");
  });

  it("opencode: the shim this release writes is current; another one says to reinstall", () => {
    const t = target("opencode");
    installHost(t);
    const shim = join(t.home, ".config", "opencode", "plugins", "prism.js");
    expect(readOpencodeShim(readFileSync(shim, "utf8"))?.node).toBe(t.node);
    expect(opencodeHookCheck(shim).status).toBe("ok");
    writeFileSync(shim, `${readFileSync(shim, "utf8")}// older\n`);
    expect(opencodeHookCheck(shim)).toMatchObject({
      status: "warn",
      detail: expect.stringContaining("Run `prism install opencode`."),
    });
    writeFileSync(shim, "export const Prism = 1;\n");
    expect(opencodeHookCheck(shim).detail).toContain("changed by hand");
  });

  it("checks every hook config the install record lists, and nothing else", () => {
    const claude = target("claude");
    const opencode = target("opencode");
    const files = [
      ...installHost(claude).files,
      ...installHost(opencode).files,
    ];
    const record = {
      version: "2.0.0",
      bin: "/opt/prism/bin.js",
      installedAt: "2026-10-17T00:00:00.000Z",
      hosts: ["claude", "opencode"],
      files,
    } as InstallRecord;
    const checks = hookConfigChecks(record, { fix: false, home: claude.home });
    expect(checks.map((c) => [c.label, c.status])).toEqual([
      ["Hooks", "ok"],
      ["Hooks", "ok"],
    ]);
  });
});
