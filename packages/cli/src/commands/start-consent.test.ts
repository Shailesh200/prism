/**
 * `prism start` consent (round 5, release blocker): Muse's 8 cases. Every run
 * uses a throwaway HOME and PRISM_HOME, never the real home. Assertions read
 * plan data and files on disk; text is compared only against the strings in
 * `consent-copy.ts`, so a wording change does not break these tests.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ok, PrismErrorCode, type PrismError } from "@repo-prism/shared";
import { exitCodeForError } from "../exit.js";
import {
  CONSENT_COPY,
  fileList,
  HOST_SETUP_COPY,
  wipeBlock,
} from "../install/consent-copy.js";
import { planWrites, installHost } from "../install/hosts.js";
import type { CommandContext, CommandOutcome } from "../runtime.js";
import { HOST_NAMES, runInstall, type SourceLayout } from "./install.js";
import { makeStartCommand, saidYes, type StartDeps } from "./start.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const NOW = new Date("2026-10-17T10:45:41.000Z");
const STAMP = "20261017T104541";
const ANSWER_TEXT = "Indexed 3 code files in 0.1 s.\n\nmap\n\nTry: x";

type Box = {
  home: string;
  env: NodeJS.ProcessEnv;
  layout: SourceLayout;
  repo: string;
  backups: string;
};

function box(): Box {
  const home = mkdtempSync(join(tmpdir(), "prism-consent-"));
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
  // Claude Code and Cursor are "installed" on this fake machine.
  mkdirSync(join(home, ".claude"));
  mkdirSync(join(home, ".cursor"));
  return {
    home,
    env: { PRISM_HOME: join(home, ".prism"), PRISM_DAEMON: "0" },
    layout: { bin, pack, version: "9.9.9", source: repo },
    repo,
    backups: join(home, ".prism-backups", STAMP),
  };
}

type Run = {
  outcome: CommandOutcome;
  out: string[];
  err: string[];
  asked: string[];
  answered: number;
  /** Set when the command refused (an error result). */
  error?: PrismError;
};

async function run(
  b: Box,
  opts: {
    tty?: boolean;
    reply?: string;
    yes?: boolean;
    dryRun?: boolean;
    json?: boolean;
  } = {},
): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  let answered = 0;
  const deps: StartDeps = {
    home: () => b.home,
    env: () => b.env,
    now: () => NOW,
    isTty: () => opts.tty ?? false,
    ask: async (q) => {
      asked.push(q);
      return opts.reply ?? "";
    },
    layout: () => b.layout,
    install: (input) => runInstall(input),
    answer: async () => {
      answered += 1;
      return ok({
        answer: { files: 3, elapsedMs: 100, map: "map", partial: false },
        text: ANSWER_TEXT,
      });
    },
  };
  const context = {
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
  const result = await makeStartCommand(deps)(context);
  if (!result.ok)
    return {
      outcome: undefined as never,
      error: result.error,
      out,
      err,
      asked,
      answered,
    };
  return { outcome: result.value, out, err, asked, answered };
}

const human = (r: Run) => r.outcome.human({ json: false, width: 100 } as never);

/** Every file under `dir`, with content, for "nothing changed" checks. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[path] = readFileSync(path, "utf8");
  }
  return files;
}

const USER_CURSOR = `${JSON.stringify({ mcpServers: { mine: { command: "x" } } }, null, 2)}\n`;

describe("prism start consent: Muse's 8 cases", () => {
  it("1: interactive run lists the configs and asks [y/N]", async () => {
    const b = box();
    const r = await run(b, { tty: true, reply: "" });
    expect(r.asked).toEqual([CONSENT_COPY.prompt]);
    expect(r.out[0]).toBe(CONSENT_COPY.intro(["Claude Code", "Cursor"]));
    expect(r.out).toContain(CONSENT_COPY.willWrite);
    const paths = [
      "~/.claude.json",
      "~/.claude/settings.json",
      "~/.claude/skills/prism/",
      "~/.cursor/mcp.json",
      "~/.prism/config.json",
    ];
    for (const path of paths)
      expect(r.out.some((line) => line.includes(path))).toBe(true);
    expect(r.out).toContain(
      CONSENT_COPY.backedUpFirst(`~/.prism-backups/${STAMP}/`),
    );
    expect(r.out).toContain(CONSENT_COPY.staysLocal);
  });

  it("2: N (or Enter) changes nothing and exits 0", async () => {
    for (const reply of ["", "n", "no", "maybe"]) {
      const b = box();
      const before = snapshot(b.home);
      const r = await run(b, { tty: true, reply });
      expect(human(r)).toBe(CONSENT_COPY.declined.join("\n"));
      expect(r.outcome.findings).toBeFalsy();
      expect(r.answered).toBe(0);
      expect(snapshot(b.home)).toEqual(before);
      expect(existsSync(join(b.home, ".prism-backups"))).toBe(false);
    }
    expect(["y", "Y", "yes", " YES "].every(saidYes)).toBe(true);
  });

  it("3: y backs up each existing file to ~/.prism-backups/<stamp>/configs/, installs, then indexes", async () => {
    const b = box();
    writeFileSync(join(b.home, ".cursor", "mcp.json"), USER_CURSOR);
    const r = await run(b, { tty: true, reply: "y" });
    expect(r.out).toContain(
      CONSENT_COPY.backingUp(1, `~/.prism-backups/${STAMP}/`),
    );
    expect(
      readFileSync(join(b.backups, "configs", ".cursor", "mcp.json"), "utf8"),
    ).toBe(USER_CURSOR);
    // Only existing files are backed up; new ones are not.
    expect(existsSync(join(b.backups, "configs", ".claude.json"))).toBe(false);
    const cursor = JSON.parse(
      readFileSync(join(b.home, ".cursor", "mcp.json"), "utf8"),
    );
    expect(Object.keys(cursor.mcpServers).sort()).toEqual(["mine", "prism"]);
    expect(existsSync(join(b.home, ".claude", "settings.json"))).toBe(true);
    expect(r.out).toContain(
      CONSENT_COPY.backupsAre(`~/.prism-backups/${STAMP}/`),
    );
    expect(r.out).toContain(CONSENT_COPY.uninstallHint);
    // One line per agent (Muse): Cursor gets receipts, not a verdict at stop.
    expect(r.out).toContain(HOST_SETUP_COPY["Claude Code"]);
    expect(r.out).toContain(HOST_SETUP_COPY.Cursor);
    expect(r.out.some((l) => l.includes("installed for"))).toBe(false);
    expect(r.answered).toBe(1);
    expect(human(r)).toBe(ANSWER_TEXT);
    // Status lines come before the map, in Muse's order.
    expect(
      r.out.indexOf(CONSENT_COPY.backupsAre(`~/.prism-backups/${STAMP}/`)),
    ).toBeGreaterThan(r.out.indexOf(HOST_SETUP_COPY["Claude Code"]));
  });

  it("4: --dry-run only shows the list: no question, no writes, no index", async () => {
    const b = box();
    writeFileSync(join(b.home, ".cursor", "mcp.json"), USER_CURSOR);
    const before = snapshot(b.home);
    const r = await run(b, { tty: true, dryRun: true });
    const text = human(r);
    expect(text.split("\n")[0]).toBe(CONSENT_COPY.dryRunHead);
    expect(text).toContain(CONSENT_COPY.dryIntro(["Claude Code", "Cursor"]));
    expect(text).toContain(CONSENT_COPY.dryBackedUp);
    expect(text).toContain(CONSENT_COPY.dryFooter);
    expect(text).toContain("~/.cursor/mcp.json");
    expect(r.asked).toEqual([]);
    expect(r.answered).toBe(0);
    expect(r.outcome.findings).toBeFalsy();
    expect(snapshot(b.home)).toEqual(before);
    expect(existsSync(join(b.home, ".prism"))).toBe(false);
  });

  it("5: --yes skips the question but still prints the list", async () => {
    const b = box();
    const r = await run(b, { tty: false, yes: true });
    expect(r.asked).toEqual([]);
    expect(r.out[0]).toBe(CONSENT_COPY.yesIntro(["Claude Code", "Cursor"]));
    expect(r.out.some((l) => l.includes("~/.cursor/mcp.json"))).toBe(true);
    expect(existsSync(join(b.home, ".cursor", "mcp.json"))).toBe(true);
    expect(r.answered).toBe(1);
  });

  it("6: no TTY and no --yes: nothing changes, message on stderr, exit 1", async () => {
    const b = box();
    const before = snapshot(b.home);
    const r = await run(b, { tty: false });
    expect(r.outcome.findings).toBe(true); // runtime: exit 1
    expect(r.outcome.stderr).toBe(true);
    expect(human(r)).toBe(CONSENT_COPY.noTty.join("\n"));
    expect(r.asked).toEqual([]);
    expect(r.answered).toBe(0);
    expect(snapshot(b.home)).toEqual(before);
  });

  it("7: already set up: no question, no backup, no writes", async () => {
    const b = box();
    await run(b, { yes: true });
    rmSync(join(b.home, ".prism-backups"), { recursive: true, force: true });
    const before = snapshot(b.home);
    const mtime = statSync(join(b.home, ".claude", "settings.json")).mtimeMs;
    const r = await run(b, { tty: false });
    expect(r.asked).toEqual([]);
    expect(r.outcome.findings).toBeFalsy();
    expect(human(r).split("\n")[0]).toBe(
      CONSENT_COPY.alreadySetUp("9.9.9", ["Claude Code", "Cursor"]),
    );
    expect(r.answered).toBe(1);
    expect(snapshot(b.home)).toEqual(before);
    expect(statSync(join(b.home, ".claude", "settings.json")).mtimeMs).toBe(
      mtime,
    );
    expect(existsSync(join(b.home, ".prism-backups"))).toBe(false);
  });

  it("8: 1.x data is listed before the question and moved (not deleted) after y", async () => {
    const b = box();
    const prism = join(b.home, ".prism");
    for (const ws of ["a", "b", "c"]) {
      mkdirSync(join(prism, "workspaces", ws), { recursive: true });
      writeFileSync(join(prism, "workspaces", ws, "index.json"), "{}");
    }
    mkdirSync(join(prism, "hub"));
    writeFileSync(join(prism, "hub", "hub.json"), "{}");
    const r = await run(b, { tty: true, reply: "y" });
    const block = wipeBlock({
      home: "~/.prism",
      backupDir: `~/.prism-backups/${STAMP}/1x/`,
      workspaces: 3,
      daemon: false,
      hub: true,
      customLenses: 0,
      keepsConfig: false,
      invalidLenses: 0,
    });
    for (const line of block) expect(r.out).toContain(line);
    expect(r.out.indexOf(block[0]!)).toBeLessThan(
      r.out.indexOf(CONSENT_COPY.staysLocal),
    );
    // Moved, not deleted.
    expect(readdirSync(join(b.backups, "1x", "workspaces")).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(existsSync(join(b.backups, "1x", "hub", "hub.json"))).toBe(true);
    expect(existsSync(join(prism, "workspaces"))).toBe(false);
    expect(r.out).toContain(
      CONSENT_COPY.wipeDone({
        backupDir: `~/.prism-backups/${STAMP}/1x/`,
        customLenses: 0,
        keepsConfig: false,
        droppedConfigKeys: [],
      }),
    );
    // And in the dry run, on a fresh copy.
    const b2 = box();
    mkdirSync(join(b2.home, ".prism", "hub"), { recursive: true });
    const dry = human(await run(b2, { dryRun: true }));
    expect(dry).toContain("Prism 1.x data found in ~/.prism.");
  });
});

describe("prism start --json (Atlas, 16:38)", () => {
  type PlanData = { plan: unknown };
  const data = (r: Run) => r.outcome.data as PlanData;

  it("without --yes: ok:false PRISM_YES_REQUIRED, exit 1, nothing written, the plan in the payload; --dry-run and --yes carry the same plan", async () => {
    const seed = (b: Box) =>
      writeFileSync(join(b.home, ".cursor", "mcp.json"), USER_CURSOR);
    // Refused, even on a TTY: JSON output never prompts.
    const b1 = box();
    seed(b1);
    const before = snapshot(b1.home);
    const refused = await run(b1, { json: true, tty: true });
    expect(refused.error?.code).toBe(PrismErrorCode.YES_REQUIRED);
    expect(refused.error?.code).toBe("PRISM_YES_REQUIRED");
    expect(exitCodeForError(refused.error!)).toBe(1);
    expect(refused.error?.message).toBe(CONSENT_COPY.jsonYesRequired);
    expect(refused.asked).toEqual([]);
    expect(refused.answered).toBe(0);
    expect(refused.out).toEqual([]);
    expect(snapshot(b1.home)).toEqual(before);
    const plan = (refused.error!.details as { plan: unknown }).plan as {
      writes: { path: string; exists: boolean; role: string }[];
    };
    const cursor = plan.writes.find((w) =>
      w.path.endsWith(join(".cursor", "mcp.json")),
    );
    expect(cursor).toMatchObject({ exists: true, role: "mcp" });

    // --dry-run: exit 0, the same plan.
    const b2 = box();
    seed(b2);
    const dry = await run(b2, { json: true, dryRun: true });
    expect(dry.error).toBeUndefined();
    expect(dry.outcome.findings).toBeFalsy();
    const norm = (p: unknown, home: string) =>
      JSON.parse(JSON.stringify(p).split(home).join("<HOME>"));
    expect(norm(data(dry).plan, b2.home)).toEqual(norm(plan, b1.home));

    // --yes: proceeds as normal, and reports the same plan it applied.
    const b3 = box();
    seed(b3);
    const yes = await run(b3, { json: true, yes: true });
    expect(yes.outcome.findings).toBeFalsy();
    expect(yes.out).toEqual([]); // no human lines in JSON mode
    expect(norm(data(yes).plan, b3.home)).toEqual(norm(plan, b1.home));
    expect(
      readFileSync(join(b3.backups, "configs", ".cursor", "mcp.json"), "utf8"),
    ).toBe(USER_CURSOR);
    expect(existsSync(join(b3.home, ".claude", "settings.json"))).toBe(true);
    expect(yes.answered).toBe(1);
  });
});

describe("start plan: the list is what install really writes", () => {
  it("plan mode writes nothing, and its paths match a real install", async () => {
    const b = box();
    writeFileSync(join(b.home, ".cursor", "mcp.json"), USER_CURSOR);
    const before = snapshot(b.home);
    const target = {
      scope: "user" as const,
      home: b.home,
      root: b.repo,
      node: process.execPath,
      bin: b.layout.bin,
      pack: b.layout.pack,
    };
    const planned = (["claude", "cursor"] as const).flatMap((host) =>
      planWrites(() => void installHost({ ...target, host })),
    );
    expect(snapshot(b.home)).toEqual(before);
    for (const host of ["claude", "cursor"] as const)
      installHost({ ...target, host });
    const after = snapshot(b.home);
    const changed = Object.keys(after).filter((p) => before[p] !== after[p]);
    const covered = (path: string) =>
      planned.some((w) =>
        w.kind === "dir" ? path.startsWith(`${w.path}/`) : path === w.path,
      );
    expect(changed.filter((p) => !covered(p))).toEqual([]);
    expect(
      planned.find((w) => w.path.endsWith(join(".cursor", "mcp.json")))?.exists,
    ).toBe(true);
    // A second plan after the real install is empty: "already set up".
    const again = (["claude", "cursor"] as const).flatMap((host) =>
      planWrites(() => void installHost({ ...target, host })),
    );
    expect(again).toEqual([]);
  });

  it("long paths put the label on the next line", () => {
    const lines = fileList([
      {
        agent: HOST_NAMES.opencode,
        path: "~/.config/opencode/plugins/prism.js",
        role: "plugin",
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.trim()).toBe("Prism plugin");
  });
});
