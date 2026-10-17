/**
 * start-consent-fix-2, round 2 (Arc, Muse): `prism install <agent>` asks
 * nothing but backs up each config first and prints what it wrote;
 * `prism upgrade` goes through `confirmAndWrite`; one line per agent; and
 * Muse's approved strings.
 *
 * Every run uses a throwaway HOME and PRISM_HOME, never the real home.
 */
import {
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
import { PrismErrorCode, type PrismError } from "@repo-prism/shared";
import { hookRefreshLine } from "@repo-prism/shared/hook-config";
import { readInstallRecord } from "@repo-prism/shared/prism-bin";
import { afterEach, describe, expect, it } from "vitest";
import {
  makeInstallCommand,
  makeUpgradeCommand,
  runInstall,
  type InstallDeps,
  type SourceLayout,
} from "../commands/install.js";
import type { CommandContext, CommandOutcome } from "../runtime.js";
import {
  CONSENT_COPY,
  HOST_SETUP_COPY,
  INSTALL_COPY,
  commandCopy,
  installedLines,
} from "./consent-copy.js";

const dirs: string[] = [];
afterEach(() => {
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
};

/** A built pack and server under `home`, as a layout. */
function layoutIn(home: string, name: string, version: string): SourceLayout {
  const pack = join(home, name, "pack");
  mkdirSync(join(pack, "hooks"), { recursive: true });
  writeFileSync(join(pack, "hooks", "prism-hook.mjs"), "// hook\n");
  mkdirSync(join(pack, "skills", "prism"), { recursive: true });
  writeFileSync(join(pack, "skills", "prism", "SKILL.md"), "# prism\n");
  const bin = join(home, name, "server", "bin.js");
  mkdirSync(join(home, name, "server"), { recursive: true });
  writeFileSync(bin, "");
  return { bin, pack, version, source: join(home, "_repo") };
}

/** A fake machine with Claude Code and Cursor, each with the user's own config. */
function box(): Box {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "prism-install-up-")));
  dirs.push(home);
  expect(home).not.toBe(homedir());
  const repo = join(home, "_repo");
  mkdirSync(repo);
  mkdirSync(join(home, ".claude"));
  mkdirSync(join(home, ".cursor"));
  writeFileSync(join(home, ".claude", "settings.json"), USER_CLAUDE);
  writeFileSync(join(home, ".cursor", "mcp.json"), USER_CURSOR);
  return {
    home,
    env: { PRISM_HOME: join(home, ".prism"), PRISM_DAEMON: "0" },
    layout: layoutIn(home, "_a", "9.9.9"),
    repo,
  };
}

type Opts = {
  tty?: boolean;
  ask?: (question: string) => Promise<string>;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  positionals?: string[];
};

function contextFor(b: Box, opts: Opts, out: string[]): CommandContext {
  return {
    options: { yes: opts.yes === true },
    output: { json: opts.json === true, width: 200 },
    workspace: { path: b.repo, source: "cwd" },
    writer: { out: (t: string) => out.push(t), err: () => undefined },
    args: {
      positionals: opts.positionals ?? [],
      option: () => undefined,
      flag: (name: string) => name === "dryRun" && opts.dryRun === true,
      values: () => [],
    },
    cwd: b.repo,
    progress: () => undefined,
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
  stopped: number;
  text: string;
};

async function runWith(
  b: Box,
  command: "install" | "upgrade",
  opts: Opts,
  layout: SourceLayout = b.layout,
): Promise<Ran> {
  const out: string[] = [];
  const asked: string[] = [];
  let stopped = 0;
  const deps: InstallDeps = {
    home: () => b.home,
    env: () => b.env,
    now: () => NOW,
    isTty: () => opts.tty ?? false,
    ask: async (q) => {
      asked.push(q);
      if (command === "install") throw new Error("install must not ask");
      return opts.ask ? opts.ask(q) : "";
    },
    layout: () => layout,
    recordLayout: () => layout,
    stopDaemon: async () => {
      stopped += 1;
    },
  };
  const make = command === "install" ? makeInstallCommand : makeUpgradeCommand;
  const result = await make(deps)(contextFor(b, opts, out));
  const outcome = result.ok ? result.value : undefined;
  return {
    ...(result.ok ? { outcome } : { error: result.error }),
    out,
    asked,
    stopped,
    text: [
      ...out,
      outcome?.human({ json: false, width: 200 } as never) ?? "",
    ].join("\n"),
  };
}

describe("Muse's approved strings", () => {
  it("symlink backup line names the files the links point to", () => {
    expect(CONSENT_COPY.symlinkBackup(["~/dotfiles/claude.json"])).toBe(
      "These are symlinks, so Prism backs up and changes the files they point to: ~/dotfiles/claude.json.",
    );
  });

  it("doctor --fix: 'to match the installed version', and a dry-run footer with no backticks", () => {
    const doctor = commandCopy("prism doctor --fix");
    expect(doctor.intro(["Claude Code"])).toBe(
      "Prism will update its setup for Claude Code to match the installed version.",
    );
    expect(doctor.dryFooter).toBe(
      "To update, run prism doctor --fix. In scripts, use prism doctor --fix --yes.",
    );
    expect(doctor.dryFooter).not.toContain("`");
  });

  it("the hook line names no version and has no backticks", () => {
    const line = hookRefreshLine(
      { kind: "outdated", from: "2.0.0-pre" },
      "user",
    );
    expect(line).toBe(
      "Prism's Claude Code hooks are out of date. Run prism doctor --fix to update them.",
    );
    expect(line).not.toMatch(/\d+\.\d+/);
    expect(line).not.toContain("`");
  });

  it("one line per agent; only Claude Code promises a verdict at stop", () => {
    expect(
      installedLines(["Claude Code", "Codex", "opencode", "Cursor"]),
    ).toEqual([
      "Claude Code: set up. Verdict when the agent stops.",
      "Codex: set up. The verdict comes with your next receipt.",
      "opencode: set up. The verdict comes with your next receipt.",
      "Cursor: set up for receipts. There's no verdict when the agent stops yet. Ask it for a receipt.",
    ]);
    const atStop = Object.values(HOST_SETUP_COPY).filter((line) =>
      line.includes("Verdict when the agent stops"),
    );
    expect(atStop).toEqual([HOST_SETUP_COPY["Claude Code"]]);
    expect(installedLines(["Cursor"]).join(" ")).not.toMatch(/installed for/);
  });

  it("prism upgrade names itself in the refusal and the dry-run footer", () => {
    const upgrade = commandCopy("prism upgrade");
    expect(upgrade.dryFooter).toBe(
      "To upgrade, run prism upgrade. In scripts, use prism upgrade --yes.",
    );
    expect(upgrade.noTty.join("\n")).toContain("prism upgrade --yes");
    expect(upgrade.declined).toEqual(["No changes made."]);
  });
});

describe("prism install <agent>: no question, but backed up first (Arc)", () => {
  it("backs up each existing config, then writes, then lists the files and the backup folder", async () => {
    const b = box();
    const r = await runWith(b, "install", { positionals: ["all"] });
    expect(r.error).toBeUndefined();
    expect(r.asked).toEqual([]);
    const backups = join(b.home, ".prism-backups", STAMP, "configs");
    expect(readFileSync(join(backups, ".cursor", "mcp.json"), "utf8")).toBe(
      USER_CURSOR,
    );
    expect(
      readFileSync(join(backups, ".claude", "settings.json"), "utf8"),
    ).toBe(USER_CLAUDE);
    // Then written: Prism's entries next to the user's own.
    const cursor = JSON.parse(
      readFileSync(join(b.home, ".cursor", "mcp.json"), "utf8"),
    );
    expect(Object.keys(cursor.mcpServers).toSorted()).toEqual([
      "mine",
      "prism",
    ]);
    expect(r.text).toContain(
      CONSENT_COPY.backingUp(2, `~/.prism-backups/${STAMP}/`),
    );
    expect(r.text).toContain(INSTALL_COPY.wrote);
    expect(r.text).toContain("~/.cursor/mcp.json");
    expect(r.text).toContain("~/.claude/settings.json");
    expect(r.text).toContain(
      CONSENT_COPY.backupsAre(`~/.prism-backups/${STAMP}/`),
    );
    // One line per agent; Codex has no ~/.codex here.
    expect(r.text).toContain(HOST_SETUP_COPY["Claude Code"]);
    expect(r.text).toContain(HOST_SETUP_COPY.Cursor);
    expect(r.text).toContain(HOST_SETUP_COPY.opencode);
    expect(r.text).toContain("Codex not found; skipped.");
    expect(r.text).not.toContain("installed for");
    expect(r.outcome?.data).toMatchObject({
      backupDir: join(b.home, ".prism-backups", STAMP),
    });
  });

  it("never reuses a backup folder: a second run in the same second gets -2", async () => {
    const b = box();
    await runWith(b, "install", { positionals: ["cursor"] });
    writeFileSync(join(b.home, ".cursor", "mcp.json"), USER_CURSOR);
    const again = await runWith(b, "install", { positionals: ["cursor"] });
    expect(readdirSync(join(b.home, ".prism-backups")).toSorted()).toEqual([
      STAMP,
      `${STAMP}-2`,
    ]);
    expect(again.text).toContain(
      CONSENT_COPY.backupsAre(`~/.prism-backups/${STAMP}-2/`),
    );
  });

  it("nothing to change: no backup folder, and it says no config changed", async () => {
    const b = box();
    await runWith(b, "install", { positionals: ["claude"] });
    const before = readdirSync(join(b.home, ".prism-backups"));
    const again = await runWith(b, "install", { positionals: ["claude"] });
    expect(readdirSync(join(b.home, ".prism-backups"))).toEqual(before);
    expect(again.text).toContain(INSTALL_COPY.nothingWritten);
    expect(again.text).not.toContain("Backups are in");
  });

  it("a symlinked config is backed up at its target, and the line says so", async () => {
    const b = box();
    const target = join(b.home, "dotfiles", "mcp.json");
    mkdirSync(join(b.home, "dotfiles"));
    writeFileSync(target, USER_CURSOR);
    rmSync(join(b.home, ".cursor", "mcp.json"));
    symlinkSync(target, join(b.home, ".cursor", "mcp.json"));
    const r = await runWith(b, "install", { positionals: ["cursor"] });
    expect(r.text).toContain(
      CONSENT_COPY.symlinkBackup(["~/dotfiles/mcp.json"]),
    );
    expect(
      readFileSync(
        join(b.home, ".prism-backups", STAMP, "configs", ".cursor", "mcp.json"),
        "utf8",
      ),
    ).toBe(USER_CURSOR);
  });
});

/** The two agent configs a run could change, as they are now. */
function snapshot(b: Box): string[] {
  return [
    join(b.home, ".cursor", "mcp.json"),
    join(b.home, ".claude", "settings.json"),
  ].map((path) => readFileSync(path, "utf8"));
}

describe("prism upgrade goes through confirmAndWrite (Arc)", () => {
  /** Installed from build A; build B (new server path) is now installed. */
  async function installed(): Promise<{ b: Box; next: SourceLayout }> {
    const b = box();
    await runInstall({
      hosts: ["claude", "cursor"],
      scope: "user",
      root: b.repo,
      layout: b.layout,
      env: b.env,
      now: NOW,
      home: b.home,
    });
    return { b, next: layoutIn(b.home, "_b", "9.9.10") };
  }

  it("no TTY, --json, or n: nothing written, no backup, daemon left alone", async () => {
    const { b, next } = await installed();
    const before = snapshot(b);
    const noTty = await runWith(b, "upgrade", {}, next);
    expect(noTty.outcome?.stderr).toBe(true);
    expect(noTty.outcome?.human({ json: false, width: 100 } as never)).toBe(
      commandCopy("prism upgrade").noTty.join("\n"),
    );
    const json = await runWith(b, "upgrade", { json: true, tty: true }, next);
    expect(json.error?.code).toBe(PrismErrorCode.YES_REQUIRED);
    const no = await runWith(
      b,
      "upgrade",
      { tty: true, ask: async () => "n" },
      next,
    );
    expect(no.asked).toEqual([CONSENT_COPY.prompt]);
    expect(no.text).toContain("No changes made.");
    for (const run of [noTty, json, no]) expect(run.stopped).toBe(0);
    expect(snapshot(b)).toEqual(before);
    expect(existsSync(join(b.home, ".prism-backups"))).toBe(false);
    const record = readInstallRecord(b.env);
    expect(record.kind === "ok" && record.record.version).toBe("9.9.9");
  });

  it("--dry-run lists the files and writes nothing", async () => {
    const { b, next } = await installed();
    const before = snapshot(b);
    const dry = await runWith(b, "upgrade", { dryRun: true }, next);
    expect(dry.text).toContain("~/.cursor/mcp.json");
    expect(dry.text).toContain(commandCopy("prism upgrade").dryFooter);
    expect(snapshot(b)).toEqual(before);
    expect(dry.stopped).toBe(0);
  });

  it("y on a terminal (or --yes): backed up, re-linked, daemon stopped", async () => {
    const { b, next } = await installed();
    const [cursorBefore] = snapshot(b);
    const yes = await runWith(
      b,
      "upgrade",
      { tty: true, ask: async () => "y" },
      next,
    );
    expect(yes.asked).toEqual([CONSENT_COPY.prompt]);
    expect(yes.stopped).toBe(1);
    expect(
      readFileSync(
        join(b.home, ".prism-backups", STAMP, "configs", ".cursor", "mcp.json"),
        "utf8",
      ),
    ).toBe(cursorBefore);
    expect(readFileSync(join(b.home, ".cursor", "mcp.json"), "utf8")).toContain(
      next.bin,
    );
    expect(yes.text).toContain("Prism 9.9.9 → 9.9.10");
    expect(yes.text).toContain(
      CONSENT_COPY.backupsAre(`~/.prism-backups/${STAMP}/`),
    );

    // Now current: --yes from a script asks nothing and changes no config.
    const again = await runWith(b, "upgrade", { yes: true }, next);
    expect(again.asked).toEqual([]);
    expect(again.outcome?.data).toMatchObject({ changed: false });
    expect(readdirSync(join(b.home, ".prism-backups"))).toEqual([STAMP]);
  });

  it("configs already current: no question, only the record's version moves", async () => {
    const { b } = await installed();
    const same = { ...b.layout, version: "9.9.10" };
    const before = snapshot(b);
    const r = await runWith(b, "upgrade", {}, same);
    expect(r.asked).toEqual([]);
    expect(r.error).toBeUndefined();
    expect(r.stopped).toBe(1);
    expect(snapshot(b)).toEqual(before);
    const record = readInstallRecord(b.env);
    expect(record.kind === "ok" && record.record.version).toBe("9.9.10");
  });
});
