/**
 * start-consent-fix-2 (Shailesh, Atlas, Arc; Scout QA; Muse): one consent
 * step for `prism start` and `prism doctor --fix` (`confirmAndWrite`), a `y`
 * that is read as yes, a 1.x config with an unknown key, both paths of a
 * symlink, and `runInstall`'s order: the 1.x move before any host config.
 *
 * Every run uses a throwaway HOME and PRISM_HOME, never the real home.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { ok, PrismErrorCode, type PrismError } from "@repo-prism/shared";
import {
  checkClaudeHooks,
  claudeHookEntries,
  EARLIER_CLAUDE_HOOK_PLANS,
} from "@repo-prism/shared/hook-config";
import { DEFAULT_LENSES } from "@repo-prism/shared/lens-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixAgentConfigs, type DoctorDeps } from "../commands/doctor.js";
import { runInstall, type SourceLayout } from "../commands/install.js";
import { makeStartCommand, type StartDeps } from "../commands/start.js";
import type { CommandContext, CommandOutcome } from "../runtime.js";
import { askLine } from "./confirm-write.js";
import { CONSENT_COPY, commandCopy } from "./consent-copy.js";

/** Lets one test make `renameSync` fail for one destination. */
const failRename = vi.hoisted(() => ({
  to: null as string | null,
  times: Infinity,
}));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const renameSync: typeof real.renameSync = (from, to) => {
    if (
      failRename.to !== null &&
      String(to) === failRename.to &&
      failRename.times-- > 0
    ) {
      const error = new Error(
        `EBUSY: resource busy, rename '${String(to)}'`,
      ) as NodeJS.ErrnoException;
      error.code = "EBUSY";
      throw error;
    }
    return real.renameSync(from, to);
  };
  return { ...real, renameSync, default: { ...real, renameSync } };
});

/** Runs a check the moment `runInstall` calls `wipe1x`. */
const atWipe = vi.hoisted(() => ({ check: null as null | (() => void) }));
vi.mock("./wipe.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("./wipe.js")>();
  return {
    ...real,
    wipe1x: (options: Parameters<typeof real.wipe1x>[0]) => {
      atWipe.check?.();
      return real.wipe1x(options);
    },
  };
});

const dirs: string[] = [];
const locked: string[] = [];
afterEach(() => {
  failRename.to = null;
  failRename.times = Infinity;
  atWipe.check = null;
  for (const dir of locked.splice(0)) chmodSync(dir, 0o755);
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const NOW = new Date("2026-10-17T10:45:41.000Z");
const STAMP = "20261017T104541";
const USER_CURSOR = `${JSON.stringify({ mcpServers: { mine: { command: "x" } } }, null, 2)}\n`;
const USER_CLAUDE = `${JSON.stringify({ theme: "dark" }, null, 2)}\n`;

type Box = {
  home: string;
  env: NodeJS.ProcessEnv;
  layout: SourceLayout;
  repo: string;
  backups: string;
  /** The agent configs a test watches, with their content before the run. */
  configs: Record<string, string>;
};

/** A fake machine with Claude Code and Cursor, each with the user's own config. */
function box(): Box {
  // Real path (macOS tmp is under a symlinked /var): a symlink's target is
  // shown resolved, and must sit under the home to show as `~/…`.
  const home = realpathSync(
    mkdtempSync(join(tmpdir(), "prism-consent-fix-2-")),
  );
  dirs.push(home);
  expect(home).not.toBe(homedir());
  const pack = join(home, "_pack");
  mkdirSync(join(pack, "hooks"), { recursive: true });
  writeFileSync(join(pack, "hooks", "prism-hook.mjs"), "// hook\n");
  mkdirSync(join(pack, "skills", "prism"), { recursive: true });
  writeFileSync(join(pack, "skills", "prism", "SKILL.md"), "# prism\n");
  const bin = join(home, "_server", "bin.js");
  mkdirSync(join(home, "_server"), { recursive: true });
  writeFileSync(bin, "");
  const repo = join(home, "_repo");
  mkdirSync(repo);
  mkdirSync(join(home, ".claude"));
  mkdirSync(join(home, ".cursor"));
  const configs = {
    [join(home, ".claude", "settings.json")]: USER_CLAUDE,
    [join(home, ".cursor", "mcp.json")]: USER_CURSOR,
  };
  for (const [path, text] of Object.entries(configs)) writeFileSync(path, text);
  return {
    home,
    env: { PRISM_HOME: join(home, ".prism"), PRISM_DAEMON: "0" },
    layout: { bin, pack, version: "9.9.9", source: repo },
    repo,
    backups: join(home, ".prism-backups", STAMP),
    configs,
  };
}

/** A 1.x Prism home: an index, a custom lens and a config with a key 2.x does not know. */
function add1x(b: Box): string {
  const prism = join(b.home, ".prism");
  mkdirSync(join(prism, "workspaces", "old"), { recursive: true });
  writeFileSync(join(prism, "workspaces", "old", "index.db"), "1x");
  mkdirSync(join(prism, "lenses"));
  writeFileSync(
    join(prism, "lenses", "mine.json"),
    JSON.stringify({
      ...DEFAULT_LENSES[0],
      id: "mine",
      name: "Mine",
      seededDefault: false,
    }),
  );
  writeFileSync(
    join(prism, "config.json"),
    JSON.stringify({ extraTools: ["foo"], telemetry: true }),
  );
  return prism;
}

function unchanged(b: Box): void {
  for (const [path, text] of Object.entries(b.configs))
    expect(readFileSync(path, "utf8")).toBe(text);
}

type Opts = {
  tty?: boolean;
  ask?: (question: string) => Promise<string>;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
};

function contextFor(
  b: Box,
  opts: Opts,
  out: string[],
  err: string[],
): CommandContext {
  return {
    options: { yes: opts.yes === true },
    output: { json: opts.json === true, width: 100 },
    workspace: { path: b.repo, source: "cwd" },
    writer: {
      out: (t: string) => out.push(t),
      err: (t: string) => err.push(t),
    },
    args: {
      positionals: [],
      option: () => undefined,
      flag: (name: string) => name === "dryRun" && opts.dryRun === true,
      values: () => [],
    },
    cwd: b.repo,
    progress: (t: string) => err.push(t),
    open: async () => {
      throw new Error("not used");
    },
  } as unknown as CommandContext;
}

type Ran = {
  outcome?: CommandOutcome;
  error?: PrismError;
  out: string[];
  asked: string[];
};

async function start(b: Box, opts: Opts = {}): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const deps: StartDeps = {
    home: () => b.home,
    env: () => b.env,
    now: () => NOW,
    isTty: () => opts.tty ?? false,
    ask: async (q) => {
      asked.push(q);
      return opts.ask ? opts.ask(q) : "";
    },
    layout: () => b.layout,
    install: (input) => runInstall(input),
    answer: async () =>
      ok({
        answer: { files: 1, elapsedMs: 1, map: "map", partial: false },
        text: "answer",
      }),
  };
  const result = await makeStartCommand(deps)(contextFor(b, opts, out, err));
  return result.ok
    ? { outcome: result.value, out, asked }
    : { error: result.error, out, asked };
}

const text = (r: Ran) =>
  r.outcome?.human({ json: false, width: 100 } as never) ?? "";

/** `askLine` over a real readline, fed `input`. */
function ask(input: string): Promise<string> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const answer = askLine(CONSENT_COPY.prompt, stdin, stdout);
  stdin.end(input);
  return answer;
}

describe("askLine (Scout QA blocker 1: every y was read as no)", () => {
  it("returns the line typed, y included; Enter or end of input is empty", async () => {
    expect(await ask("y\n")).toBe("y");
    expect(await ask("n\n")).toBe("n");
    expect(await ask("\n")).toBe("");
    expect(await ask("")).toBe("");
  });

  it("a real readline y goes all the way through prism start: backed up, then written", async () => {
    const b = box();
    const r = await start(b, {
      tty: true,
      ask: (q) => {
        const stdin = new PassThrough();
        stdin.end("y\n");
        return askLine(q, stdin, new PassThrough());
      },
    });
    expect(r.asked).toEqual([CONSENT_COPY.prompt]);
    expect(r.outcome?.data).toMatchObject({ installed: ["claude", "cursor"] });
    expect(readFileSync(join(b.home, ".cursor", "mcp.json"), "utf8")).toMatch(
      /"prism"/,
    );
    expect(
      readFileSync(join(b.backups, "configs", ".cursor", "mcp.json"), "utf8"),
    ).toBe(USER_CURSOR);
  });
});

describe("nothing writes to an agent config without a yes", () => {
  it("no TTY: refused on stderr, nothing written, no backup", async () => {
    const b = box();
    const r = await start(b);
    expect(r.outcome?.stderr).toBe(true);
    expect(text(r)).toBe(CONSENT_COPY.noTty.join("\n"));
    expect(r.asked).toEqual([]);
    unchanged(b);
    expect(existsSync(join(b.home, ".prism-backups"))).toBe(false);
  });

  it("--json without --yes: PRISM_YES_REQUIRED, the message points at error.details.plan, nothing written", async () => {
    const b = box();
    const r = await start(b, { json: true, tty: true });
    expect(r.error?.code).toBe(PrismErrorCode.YES_REQUIRED);
    expect(r.error?.message).toContain("error.details.plan");
    expect(r.error?.message).not.toContain("data.plan");
    const details = r.error?.details as
      | { plan: { writes: unknown[] } }
      | undefined;
    expect(details?.plan.writes.length).toBeGreaterThan(0);
    expect(r.asked).toEqual([]);
    unchanged(b);
  });
});

describe("1.x config with a key 2.x does not know (Scout QA blocker 2)", () => {
  it("the plan is shown, lists the key as dropped, and --yes keeps only the known keys", async () => {
    const b = box();
    const prism = add1x(b);
    const dry = await start(b, { dryRun: true });
    expect(dry.error).toBeUndefined();
    expect(text(dry)).toMatch(/config key telemetry\s+→ dropped/);
    const data = dry.outcome?.data as {
      plan: { wipe: { droppedConfigKeys: string[] } };
    };
    expect(data.plan.wipe.droppedConfigKeys).toEqual(["telemetry"]);

    const run = await start(b, { yes: true });
    expect(run.error).toBeUndefined();
    expect(
      JSON.parse(readFileSync(join(prism, "config.json"), "utf8")),
    ).toEqual({ extraTools: ["foo", "receipt"] });
    expect(
      JSON.parse(readFileSync(join(b.backups, "1x", "config.json"), "utf8")),
    ).toEqual({ extraTools: ["foo"], telemetry: true });
  });
});

describe("a symlinked config shows both paths (Muse)", () => {
  it("the list names link and target, and the backup line names the target", async () => {
    const b = box();
    const target = join(b.home, "dotfiles", "claude", "settings.json");
    mkdirSync(join(b.home, "dotfiles", "claude"), { recursive: true });
    const link = join(b.home, ".claude", "settings.json");
    rmSync(link);
    writeFileSync(target, USER_CLAUDE);
    symlinkSync(target, link);
    const dry = text(await start(b, { dryRun: true }));
    expect(dry).toContain(
      "~/.claude/settings.json (symlink → ~/dotfiles/claude/settings.json)",
    );
    expect(dry).toContain(
      CONSENT_COPY.symlinkBackup(["~/dotfiles/claude/settings.json"]),
    );
    const asked = await start(b, { tty: true, ask: async () => "n" });
    expect(asked.out).toContain(
      CONSENT_COPY.symlinkBackup(["~/dotfiles/claude/settings.json"]),
    );
    expect(readFileSync(target, "utf8")).toBe(USER_CLAUDE);
  });
});

describe("runInstall order (Arc): the 1.x move comes before any host config", () => {
  it("through prism start --yes: at the 1.x move, the configs are backed up and still untouched", async () => {
    const b = box();
    add1x(b);
    let checked = false;
    atWipe.check = () => {
      unchanged(b);
      expect(
        readFileSync(join(b.backups, "configs", ".cursor", "mcp.json"), "utf8"),
      ).toBe(USER_CURSOR);
      checked = true;
    };
    const r = await start(b, { yes: true });
    expect(r.error).toBeUndefined();
    expect(checked).toBe(true);
    expect(readFileSync(join(b.home, ".cursor", "mcp.json"), "utf8")).toMatch(
      /"prism"/,
    );
  });

  it("a permission result leaves every host config untouched", async () => {
    const b = box();
    const prism = add1x(b);
    chmodSync(prism, 0o555);
    locked.push(prism);
    const result = await runInstall({
      hosts: ["claude", "cursor"],
      scope: "user",
      root: b.repo,
      layout: b.layout,
      env: b.env,
      now: NOW,
      home: b.home,
    });
    expect(result.kind).toBe("permission");
    unchanged(b);
    expect(existsSync(join(b.home, ".claude.json"))).toBe(false);
  });

  it("a thrown 1.x move (rolled back) leaves every host config untouched", async () => {
    const b = box();
    const prism = add1x(b);
    // The new home cannot take its place: the old one moves back, then throw.
    failRename.to = prism;
    failRename.times = 1;
    await expect(
      runInstall({
        hosts: ["claude", "cursor"],
        scope: "user",
        root: b.repo,
        layout: b.layout,
        env: b.env,
        now: NOW,
        home: b.home,
      }),
    ).rejects.toThrow(/EBUSY/);
    unchanged(b);
    expect(existsSync(join(b.home, ".claude.json"))).toBe(false);
    expect(
      readFileSync(join(prism, "workspaces", "old", "index.db"), "utf8"),
    ).toBe("1x");
  });
});

describe("prism doctor --fix goes through the same consent step", () => {
  /** Installed for Claude Code, then its hooks set back to an earlier release's. */
  async function outdated(): Promise<{
    b: Box;
    settings: string;
    old: string;
  }> {
    const b = box();
    await runInstall({
      hosts: ["claude"],
      scope: "user",
      root: b.repo,
      layout: b.layout,
      env: b.env,
      now: NOW,
      home: b.home,
    });
    const settings = join(b.home, ".claude", "settings.json");
    const launcher = `"${process.execPath}" "${join(b.layout.pack, "hooks", "prism-hook.mjs")}"`;
    const current = JSON.parse(readFileSync(settings, "utf8"));
    const old = `${JSON.stringify(
      {
        ...current,
        hooks: claudeHookEntries(
          launcher,
          EARLIER_CLAUDE_HOOK_PLANS["2.0.0-pre"]!,
        ),
      },
      null,
      2,
    )}\n`;
    writeFileSync(settings, old);
    expect(checkClaudeHooks(settings).kind).toBe("outdated");
    return { b, settings, old };
  }

  async function doctorFix(b: Box, opts: Opts = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const asked: string[] = [];
    let stopped = 0;
    const deps: DoctorDeps = {
      home: () => b.home,
      env: () => b.env,
      now: () => NOW,
      isTty: () => opts.tty ?? false,
      ask: async (q) => {
        asked.push(q);
        return opts.ask ? opts.ask(q) : "";
      },
      layout: () => b.layout,
      stopDaemon: async () => {
        stopped += 1;
      },
    };
    const fix = await fixAgentConfigs(contextFor(b, opts, out, err), deps);
    return { fix, out, asked, stopped };
  }

  it("no TTY, --json, or n: nothing written, no backup, daemon left alone", async () => {
    const { b, settings, old } = await outdated();
    const noTty = await doctorFix(b);
    expect("stop" in noTty.fix && noTty.fix.stop.ok).toBe(true);
    if ("stop" in noTty.fix && noTty.fix.stop.ok) {
      expect(noTty.fix.stop.value.stderr).toBe(true);
      expect(
        noTty.fix.stop.value.human({ json: false, width: 100 } as never),
      ).toBe(commandCopy("prism doctor --fix").noTty.join("\n"));
    }
    const json = await doctorFix(b, { json: true, tty: true });
    expect(
      "stop" in json.fix && !json.fix.stop.ok && json.fix.stop.error.code,
    ).toBe(PrismErrorCode.YES_REQUIRED);
    const no = await doctorFix(b, { tty: true, ask: async () => "n" });
    expect(no.asked).toEqual([CONSENT_COPY.prompt]);
    for (const run of [noTty, json, no]) expect(run.stopped).toBe(0);
    expect(readFileSync(settings, "utf8")).toBe(old);
    expect(existsSync(join(b.home, ".prism-backups"))).toBe(false);
  });

  it("y: the list names the hooks file, it is backed up, then updated; a second run asks nothing", async () => {
    const { b, settings, old } = await outdated();
    const yes = await doctorFix(b, { tty: true, ask: async () => "y" });
    expect(yes.asked).toEqual([CONSENT_COPY.prompt]);
    expect(yes.out.join("\n")).toContain("~/.claude/settings.json");
    expect(
      readFileSync(
        join(b.backups, "configs", ".claude", "settings.json"),
        "utf8",
      ),
    ).toBe(old);
    expect(checkClaudeHooks(settings).kind).toBe("current");
    expect(JSON.parse(readFileSync(settings, "utf8")).theme).toBe("dark");
    expect(yes.stopped).toBe(1);

    const again = await doctorFix(b, { tty: true, ask: async () => "y" });
    expect(again.asked).toEqual([]);
    expect(
      "checks" in again.fix && again.fix.checks.map((c) => c.label),
    ).toEqual(["Daemon", "Fix"]);
    expect(readdirSync(join(b.home, ".prism-backups"))).toEqual([STAMP]);
  });
});
