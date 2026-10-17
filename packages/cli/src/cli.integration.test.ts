import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stopDaemon } from "@repo-prism/daemon";
import { DEFAULT_LENSES } from "@repo-prism/shared/lens-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COMMANDS } from "./commands.js";

/**
 * These spawn the real binary through the documented entry point, because the
 * things most likely to break — a stray byte on stdout, an exit code the
 * framework decided on our behalf, colour leaking into a pipe — are invisible
 * to an in-process test.
 */

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const binary = join(packageDir, "dist", "cli.js");

const fixture = join(
  packageDir,
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

type Run = { stdout: string; stderr: string; code: number };

function runCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
  cwd: string = packageDir,
  input?: string,
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binary, ...args], {
      env: { ...process.env, ...env },
      cwd,
    });
    if (input !== undefined) child.stdin.end(input);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

/** Built from a code point so the linter's control-character rule is happy. */
const ANSI = new RegExp(`${String.fromCodePoint(0x1b)}\\[[0-9;]*m`);

describe("prism binary (M-028)", () => {
  afterAll(async () => {
    await rm(join(fixture, ".prism"), { recursive: true, force: true });
  });

  it("prints the Core version and API level", async () => {
    const result = await runCli(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/core \d+\.\d+\.\d+, API level \d+/);
  });

  it("exits 2 with usage on stderr for an unknown flag", async () => {
    const result = await runCli(["--not-a-real-flag"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown option");
    // Usage text must never contaminate stdout — a script reading stdout
    // should get nothing rather than help text it will try to parse.
    expect(result.stdout).toBe("");
  });

  it("exits 2 for an unknown command", async () => {
    const result = await runCli(["definitely-not-a-command"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("indexes and prints the map when given no command (SMK-5)", async () => {
    const result = await runCli([], {}, fixture);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^Indexed \d+ code files in [\d.]+ s\.\n/);
    expect(result.stdout).toMatch(
      /Try: prism prepare "<task>", or ask your agent for a change in plain words\./,
    );
  }, 60_000);

  it("global flags with no command still give the first answer", async () => {
    const result = await runCli(["--json"], {}, fixture);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
  }, 60_000);

  describe("prism start (ONB)", () => {
    let home: string;
    beforeAll(async () => {
      home = await mkdtemp(join(tmpdir(), "prism-start-"));
    });
    afterAll(async () => {
      // `prism start` leaves a daemon running, as it should for a user.
      for (const name of ["hosts", "none", "upgrade"]) {
        await stopDaemon({
          env: { ...process.env, ...env(join(home, name)), PRISM_DAEMON: "1" },
        });
      }
      await rm(home, { recursive: true, force: true });
    });
    const env = (dir: string) => ({
      HOME: dir,
      USERPROFILE: dir,
      PRISM_HOME: join(dir, ".prism"),
      XDG_CONFIG_HOME: join(dir, ".config"),
    });

    it("installs every detected host, indexes and answers (ONB-1, ONB-3)", async () => {
      const dir = join(home, "hosts");
      await mkdir(join(dir, ".claude"), { recursive: true });
      await mkdir(join(dir, ".cursor"), { recursive: true });
      // No TTY here: without --yes, start changes nothing and exits 1.
      const refused = await runCli(["start"], env(dir), fixture);
      expect(refused.code).toBe(1);
      expect(refused.stderr).toMatch(/--yes/);
      await expect(
        readFile(join(dir, ".cursor", "mcp.json"), "utf8"),
      ).rejects.toThrow();
      const json = await runCli(["start", "--json"], env(dir), fixture);
      expect(json.code).toBe(1);
      const refusal = JSON.parse(json.stdout);
      expect(refusal.ok).toBe(false);
      expect(refusal.error.code).toBe("PRISM_YES_REQUIRED");
      // No TTY, no --yes: nothing written, and the message names --yes.
      expect(refusal.error.message).toMatch(/--yes/);
      await expect(
        readFile(join(dir, ".cursor", "mcp.json"), "utf8"),
      ).rejects.toThrow();
      await expect(readdir(join(dir, ".prism-backups"))).rejects.toThrow();
      expect(refusal.error.details.plan.writes.length).toBeGreaterThan(0);
      const dry = await runCli(["start", "--dry-run"], env(dir), fixture);
      expect(dry.code).toBe(0);
      expect(dry.stdout).toMatch(/~\/\.cursor\/mcp\.json/);
      const first = await runCli(["start", "--yes"], env(dir), fixture);
      expect(first.code).toBe(0);
      // Piped output wraps at 80 columns (or $COLUMNS): compare the words,
      // not where the lines break (Scout QA).
      const words = first.stdout.replace(/\s+/g, " ");
      expect(words).toContain(
        "Claude Code: set up. Verdict when the agent stops.",
      );
      expect(words).toContain(
        "Cursor: set up for receipts. There's no verdict when the agent stops yet. Ask it for a receipt.",
      );
      expect(first.stdout).toMatch(/Indexed \d+ code files/);
      expect(first.stdout).toMatch(/prism prepare/);
      const settings = await readFile(
        join(dir, ".claude", "settings.json"),
        "utf8",
      );
      const mcp = await readFile(join(dir, ".cursor", "mcp.json"), "utf8");
      // Already set up: no question needed, even without a TTY.
      const again = await runCli(["start"], env(dir), fixture);
      expect(again.code).toBe(0);
      expect(
        await readFile(join(dir, ".claude", "settings.json"), "utf8"),
      ).toBe(settings);
      expect(await readFile(join(dir, ".cursor", "mcp.json"), "utf8")).toBe(
        mcp,
      );
    }, 120_000);

    it("piped y or n is not a yes: without a TTY nothing is written and it exits 1", async () => {
      const dir = join(home, "piped");
      await mkdir(join(dir, ".cursor"), { recursive: true });
      for (const answer of ["y\n", "n\n"]) {
        const run = await runCli(["start"], env(dir), fixture, answer);
        expect(run.code).toBe(1);
        expect(run.stderr.replace(/\s+/g, " ")).toContain(
          "No terminal to confirm in. Run again with --yes to apply, or --dry-run to preview.",
        );
        expect(run.stdout).not.toMatch(/Continue\? \[y\/N\]/);
        expect(await readdir(join(dir, ".cursor"))).toEqual([]);
        await expect(readdir(join(dir, ".prism-backups"))).rejects.toThrow();
      }
    }, 60_000);

    it("moves 1.x data in one step and keeps a symlinked config a link (Arc review)", async () => {
      const dir = join(home, "upgrade");
      const prism = join(dir, ".prism");
      // A 1.x home: an index and a custom lens, no version.json.
      await mkdir(join(prism, "workspaces", "old"), { recursive: true });
      await writeFile(join(prism, "workspaces", "old", "index.db"), "1x");
      await mkdir(join(prism, "lenses"), { recursive: true });
      await writeFile(
        join(prism, "lenses", "mine.json"),
        JSON.stringify({
          ...DEFAULT_LENSES[0],
          id: "mine",
          name: "Mine",
          seededDefault: false,
        }),
      );
      // Claude's config managed by a dotfiles tool: a symlink into a repo.
      const target = join(dir, "dotfiles", "claude.json");
      await mkdir(join(dir, "dotfiles"), { recursive: true });
      await writeFile(target, '{"mine":true}\n');
      await symlink(target, join(dir, ".claude.json"));
      // A 1.x config with a key 2.x does not know (Scout QA: exit 3 before).
      await writeFile(
        join(prism, "config.json"),
        JSON.stringify({ extraTools: ["foo"], telemetry: true }),
      );
      // An earlier backup folder that must not be touched.
      const earlier = join(dir, ".prism-backups", "20000101T000000");
      await mkdir(join(earlier, "configs"), { recursive: true });
      await writeFile(join(earlier, "configs", "keep.txt"), "earlier");

      // The plan shows before anything else: the dropped key, and both
      // paths of the symlink (Muse).
      const dry = await runCli(["start", "--dry-run"], env(dir), fixture);
      expect(dry.code).toBe(0);
      expect(dry.stdout).toMatch(/config key telemetry\s+→ dropped/);
      expect(dry.stdout).toContain(
        "~/.claude.json (symlink → ~/dotfiles/claude.json)",
      );
      expect(dry.stdout).toContain(
        "These are symlinks, so Prism backs up and changes the files they point to: ~/dotfiles/claude.json.",
      );

      const run = await runCli(["start", "--yes"], env(dir), fixture);
      expect(run.code).toBe(0);
      const config = JSON.parse(
        await readFile(join(prism, "config.json"), "utf8"),
      );
      expect(config).toEqual({ extraTools: ["foo", "receipt"] });
      // 1.x moved whole; 2.x home written back with the custom lens.
      const version = JSON.parse(
        await readFile(join(prism, "version.json"), "utf8"),
      );
      expect(version.major).toBe(2);
      const lenses = await readFile(
        join(prism, "lenses", "lenses.json"),
        "utf8",
      );
      expect(lenses).toContain('"mine"');
      const backups = (await readdir(join(dir, ".prism-backups"))).filter(
        (name) => name !== "20000101T000000",
      );
      expect(backups).toHaveLength(1);
      const backup = join(dir, ".prism-backups", backups[0]!);
      expect(
        await readFile(
          join(backup, "1x", "workspaces", "old", "index.db"),
          "utf8",
        ),
      ).toBe("1x");
      // The symlink is still a link; Prism wrote through to its target, and
      // the target's old content is in the backup.
      expect((await lstat(join(dir, ".claude.json"))).isSymbolicLink()).toBe(
        true,
      );
      expect(await readFile(target, "utf8")).toMatch(/"prism"/);
      expect(
        await readFile(join(backup, "configs", ".claude.json"), "utf8"),
      ).toBe('{"mine":true}\n');
      expect(await readFile(join(earlier, "configs", "keep.txt"), "utf8")).toBe(
        "earlier",
      );
    }, 120_000);

    it("still indexes when no agent is installed (ONB-2)", async () => {
      const dir = join(home, "none");
      await mkdir(dir, { recursive: true });
      const result = await runCli(["start"], env(dir), fixture);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/^No coding agent found/);
      expect(result.stdout).toMatch(/Indexed \d+ code files/);
    }, 60_000);
  });

  it("suggests a nearby command name for typos", async () => {
    const result = await runCli(["blsat"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/Did you mean blast/i);
  });

  it("runs doctor against the fixture", async () => {
    const result = await runCli(["doctor", "--workspace", fixture]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Prism doctor");
    expect(result.stdout).toContain(fixture);
  }, 60_000);

  it("says which workspace it chose and why", async () => {
    // Git-root discovery is helpful until it surprises someone; doctor is
    // where that surprise gets explained.
    const result = await runCli(["doctor", "--workspace", fixture]);
    expect(result.stdout).toMatch(/Chosen via\s+--workspace/);
  }, 60_000);

  it("emits nothing but JSON on stdout", async () => {
    const result = await runCli(["overview", "--workspace", fixture, "--json"]);
    expect(result.code).toBe(0);

    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      data: { dna: unknown; landmarks: unknown };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.dna).toBeTypeOf("object");
    expect(parsed.data.landmarks).toBeTypeOf("object");
  }, 60_000);

  it("keeps progress off stdout in JSON mode", async () => {
    const result = await runCli(["index", "--workspace", fixture, "--json"]);
    expect(result.code).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout).not.toContain("Indexing");
  }, 60_000);

  it("puts progress on stderr in human mode", async () => {
    const result = await runCli(["index", "--workspace", fixture]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("Indexing");
  }, 60_000);

  it("suppresses progress under --quiet", async () => {
    const result = await runCli(["index", "--workspace", fixture, "--quiet"]);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("Indexing");
  }, 60_000);

  it("emits no ANSI when piped, which is how these tests run", async () => {
    const result = await runCli(["doctor", "--workspace", fixture]);
    expect(ANSI.test(result.stdout)).toBe(false);
  }, 60_000);

  it("emits no ANSI under NO_COLOR", async () => {
    const result = await runCli(["doctor", "--workspace", fixture], {
      NO_COLOR: "1",
    });
    expect(ANSI.test(result.stdout)).toBe(false);
  }, 60_000);

  it("reads PRISM_WORKSPACE when no flag is given", async () => {
    const result = await runCli(["doctor"], { PRISM_WORKSPACE: fixture });
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Chosen via\s+PRISM_WORKSPACE/);
  }, 60_000);

  it("reports a missing workspace as a usage error, in the envelope", async () => {
    const missing = join(fixture, "..", "not-a-real-directory-8fa2");
    const result = await runCli(["overview", "--workspace", missing, "--json"]);

    expect(result.code).toBe(2);
    // In JSON mode even the failure belongs on stdout, so a script reading one
    // stream gets the whole story.
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      error: { code: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("PRISM_INVALID_PATH");
  }, 60_000);

  it("puts a human-mode failure on stderr and leaves stdout empty", async () => {
    const missing = join(fixture, "..", "not-a-real-directory-8fa2");
    const result = await runCli(["overview", "--workspace", missing]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("PRISM_INVALID_PATH");
  }, 60_000);

  it("documents exit codes in --help", async () => {
    const result = await runCli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Exit codes:");
    expect(result.stdout).toContain("Examples:");
  });

  it("accepts a global flag after the subcommand, which is how people type", async () => {
    const result = await runCli(["overview", "--workspace", fixture, "--json"]);
    expect(result.code).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  }, 60_000);

  /**
   * Exit 1 means "the analysis found what you asked about" — a real answer. A
   * mistyped command line is not an answer, and a CI job that cannot tell the
   * two apart will either ignore findings or fail on typos. Commander wants to
   * exit 1 for both, so these cases are pinned.
   */
  describe("usage errors are exit 2, never exit 1", () => {
    const cases: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["missing a required argument", ["explore"]],
      ["missing the second required argument", ["route", "a.ts"]],
      ["given an argument the command does not take", ["deps", "a.ts"]],
      ["an unknown command", ["nope"]],
      ["an unknown flag", ["overview", "--nope"]],
      ["a bad --fail-on value", ["blast", "a.ts", "--fail-on", "catastrophic"]],
      ["a bad --limit value", ["cycles", "--limit", "0"]],
      ["an unknown data action", ["data", "nope"]],
      ["an unknown doctor topic", ["doctor", "nope"]],
    ];

    for (const [name, argv] of cases) {
      it(name, async () => {
        const result = await runCli([...argv, "--workspace", fixture]);
        expect(result.code, `${argv.join(" ")}\n${result.stderr}`).toBe(2);
        expect(result.stdout).toBe("");
      }, 60_000);
    }
  });

  it("symbol and refs on a name that is not in the index exit 2, like blast", async () => {
    for (const command of ["symbol", "refs"]) {
      const result = await runCli([
        command,
        "noSuchSymbolAnywhere",
        "--workspace",
        fixture,
      ]);
      expect(result.code, command).toBe(2);
      expect(result.stderr).toContain("NOT_FOUND");
    }
  }, 60_000);

  it("explain on a path that does not exist is NOT_FOUND", async () => {
    const result = await runCli(["explain", "nope/x", "--workspace", fixture]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("NOT_FOUND");
  }, 60_000);

  it("habit: an unknown action is usage; edit runs $EDITOR without a warning", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-habit-"));
    try {
      const env = {
        HOME: home,
        PRISM_HOME: join(home, ".prism"),
        EDITOR: "true",
      };
      const bad = await runCli(["habit", "nope", "x"], env);
      expect(bad.code).toBe(2);
      expect(bad.stderr).toContain("Usage: prism habit");
      const add = await runCli(
        ["habit", "add", "day", "--step", "github: list my open PRs"],
        env,
      );
      expect(add.code, add.stderr).toBe(0);
      expect(add.stdout).toContain("(1 step)");
      const edit = await runCli(["habit", "edit", "day"], env);
      expect(edit.code, edit.stderr).toBe(0);
      expect(edit.stderr).not.toContain("DEP0190");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }, 60_000);

  it("`prism help` and `prism help <command>` print help", async () => {
    const root = await runCli(["help"]);
    expect(root.code).toBe(0);
    expect(root.stdout).toContain("Usage: prism");
    const sub = await runCli(["help", "blast"]);
    expect(sub.code).toBe(0);
    expect(sub.stdout).toContain("--fail-on");
  });

  it("still exits 0 for help on a subcommand", async () => {
    const result = await runCli(["blast", "--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--fail-on");
  });

  it("names the valid values when a choice flag is wrong", async () => {
    // A rejection that does not say what would have worked leaves the user
    // guessing at a closed set the CLI already knows.
    const result = await runCli([
      "blast",
      "a.ts",
      "--fail-on",
      "catastrophic",
      "--workspace",
      fixture,
    ]);
    expect(result.stderr).toMatch(/--fail-on expects one of /);
  }, 60_000);
});

/**
 * Minimal arguments for the commands that need one. Everything not listed here
 * runs with no arguments at all.
 */
const TARGET = "src/features/dashboard/Dashboard.ts";
const OTHER = "src/features/dashboard/widgets.ts";

const ARGUMENTS: Record<string, readonly string[]> = {
  explain: ["src/features/dashboard"],
  explore: [TARGET],
  prepare: ["add caching"],
  blast: [TARGET],
  "safe-delete": [TARGET],
  rename: [TARGET, "Home.ts"],
  "test-impact": [TARGET],
  symbol: ["renderDashboard"],
  refs: ["widgetCount"],
  route: [TARGET, OTHER],
  // Named explicitly: the fixture is not a git repository, and `review` with
  // no paths asks git what changed.
  review: [TARGET],
  completions: ["bash"],
  "agents-md": ["generate"],
  findings: ["list"],
  // Dry run by default: lists what it would drop and deletes nothing.
  data: ["prune"],
  remember: ["the fixture keeps widgets in one file"],
  forget: ["no-such-memory"],
  // Never a real client here: install writes editor configs under the real
  // home. An unknown client exercises the envelope without writing anything.
  install: ["no-such-client"],
};

/** Commands that cannot succeed on a fixture without extra setup. */
const EXPECT_FAILURE = new Set<string>([
  // Unknown client: a usage error, nothing written.
  "install",
  // No install record in the test home: "not installed".
  "upgrade",
]);

describe("every command (M-029)", () => {
  // Every command gets a throwaway HOME and PRISM_HOME: start, install,
  // upgrade and doctor --fix write agent configs under HOME, so a command run
  // with the real HOME rewrites the developer's setup (2026-10-17).
  let commandHome: string;

  beforeAll(async () => {
    commandHome = await mkdtemp(join(tmpdir(), "prism-cli-every-command-"));
  });

  afterAll(async () => {
    await rm(join(fixture, ".prism"), { recursive: true, force: true });
    await rm(commandHome, { recursive: true, force: true });
  });

  /** Never lets a command write into the real home or `~/.prism`. */
  const envFor = (_name: string): NodeJS.ProcessEnv => ({
    HOME: commandHome,
    USERPROFILE: commandHome,
    PRISM_HOME: join(commandHome, ".prism"),
    XDG_CONFIG_HOME: join(commandHome, ".config"),
  });

  it.each(COMMANDS.map((command) => command.name))(
    "%s produces a valid JSON envelope and nothing else on stdout",
    async (name) => {
      const result = await runCli(
        [name, ...(ARGUMENTS[name] ?? []), "--workspace", fixture, "--json"],
        envFor(name),
      );

      const parsed = JSON.parse(result.stdout) as { ok: boolean };
      expect(typeof parsed.ok).toBe("boolean");

      if (EXPECT_FAILURE.has(name)) {
        expect(parsed.ok).toBe(false);
      } else {
        expect({ name, ok: parsed.ok, code: result.code }).toEqual({
          name,
          ok: true,
          // 0 or 1 — a command that finds something still ran successfully.
          code: result.code === 1 ? 1 : 0,
        });
      }
    },
    120_000,
  );

  it.each(COMMANDS.map((command) => command.name))(
    "%s renders human output that fits 80 columns",
    async (name) => {
      if (EXPECT_FAILURE.has(name)) return;

      const result = await runCli(
        [name, ...(ARGUMENTS[name] ?? []), "--workspace", fixture, "--quiet"],
        { COLUMNS: "80", ...envFor(name) },
      );

      const tooWide = result.stdout
        .split("\n")
        // Measure by code point: an em dash is one column and three bytes.
        .filter((line) => [...line].length > 80)
        // Overflow is only a layout defect when there was somewhere to break.
        // A line that runs long because one unbreakable token — an absolute
        // path, a URL — straddles the margin had no better option, and
        // splitting one to fit makes it uncopyable.
        .filter((line) => /\s/.test([...line].slice(80).join("")));

      expect({ name, tooWide }).toEqual({ name, tooWide: [] });
    },
    120_000,
  );
});

describe("--fail-on (M-029)", () => {
  afterAll(async () => {
    await rm(join(fixture, ".prism"), { recursive: true, force: true });
  });

  it("exits 1 at or above the band and 0 below it", async () => {
    // `low` is the floor of the scale, so every score is at or above it. This
    // is the cheapest way to prove the flag is wired to the shared bands
    // without depending on a fixture keeping a particular score forever.
    const trips = await runCli([
      "blast",
      TARGET,
      "--workspace",
      fixture,
      "--fail-on",
      "low",
      "--quiet",
    ]);
    expect(trips.code).toBe(1);

    const clean = await runCli([
      "blast",
      TARGET,
      "--workspace",
      fixture,
      "--quiet",
    ]);
    expect(clean.code).toBe(0);
  }, 120_000);

  it("rejects a band it does not know, as a usage error", async () => {
    const result = await runCli([
      "blast",
      TARGET,
      "--workspace",
      fixture,
      "--fail-on",
      "catastrophic",
      "--quiet",
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("low, mid, high");
  }, 120_000);

  it("scopes the working-tree diff to the workspace, not the enclosing repo", async () => {
    // The fixture lives inside this repository, which usually has uncommitted
    // changes. Git answers for the whole repository wherever it is invoked, so
    // an unscoped `review` would report files that are not in the workspace —
    // and then fail trying to look them up in an index that has never seen
    // them. Nothing changes *inside* the fixture, so this is empty.
    const result = await runCli(["review", "--workspace", fixture, "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: { items: [] },
    });
  }, 120_000);

  it("still exits 1 in JSON mode, where the payload looks like success", async () => {
    const result = await runCli([
      "cycles",
      "--workspace",
      fixture,
      "--fail-on",
      "0",
      "--json",
    ]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
  }, 120_000);
});

describe("--format sarif (M-060)", () => {
  it("emits a SARIF 2.1.0 root object for an empty review", async () => {
    const result = await runCli([
      "review",
      "--workspace",
      fixture,
      "--format",
      "sarif",
    ]);
    expect(result.code).toBe(0);
    const log = JSON.parse(result.stdout);
    expect(log.version).toBe("2.1.0");
    expect(log.runs?.[0]?.tool?.driver?.name).toBe("Prism");
    expect(log.runs?.[0]?.results).toEqual([]);
    // Not the Prism envelope — code scanning uploaders need a SARIF root.
    expect(log.ok).toBeUndefined();
  }, 120_000);

  it("rejects an unknown format as a usage error", async () => {
    const result = await runCli([
      "cycles",
      "--workspace",
      fixture,
      "--format",
      "yaml",
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr + result.stdout).toContain("sarif");
  }, 120_000);
});

describe("path arguments (M-029)", () => {
  it("refuses a path outside the workspace rather than analysing it", async () => {
    // Clamping instead would report "nothing depends on this" about a file
    // Prism never looked at.
    const result = await runCli([
      "blast",
      "../../../etc/passwd",
      "--workspace",
      fixture,
      "--json",
    ]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "PRISM_INVALID_PATH" },
    });
  }, 120_000);

  it("resolves a relative path against the named workspace, not the cwd", async () => {
    // These tests run from `packages/cli` while pointing at a fixture
    // elsewhere. `src/features/dashboard` exists in the fixture and not here,
    // so this passing is the whole point: a path typed alongside
    // `--workspace` means a path *in* that workspace.
    const result = await runCli([
      "explain",
      "src/features/dashboard",
      "--workspace",
      fixture,
      "--json",
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
  }, 120_000);

  it("emits the Core DTO verbatim, so the CLI and the editor agree", async () => {
    // The DoD asks that `prism blast` agree with the extension's Blast Radius
    // screen. Both read the same Core method, so the only way they can
    // disagree is if the CLI reshapes the payload on its way to stdout.
    // Comparing against Core in-process is a stronger check than comparing two
    // surfaces to each other, and it fails loudly if `--json` ever grows an
    // opinion.
    const { Prism } = await import("@repo-prism/core");
    const opened = Prism.create().openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const workspace = opened.value;
    const indexed = await workspace.index();
    expect(indexed.ok).toBe(true);
    const direct = await workspace.blastRadius({ kind: "file", id: TARGET });
    workspace.close();
    expect(direct.ok ? null : direct.error).toBeNull();
    if (!direct.ok) return;

    const result = await runCli([
      "blast",
      TARGET,
      "--workspace",
      fixture,
      "--json",
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, data: direct.value });
  }, 180_000);

  it("resolves against the cwd when standing inside the workspace", async () => {
    const result = await runCli(
      ["explain", "dashboard", "--json"],
      { PRISM_WORKSPACE: fixture },
      join(fixture, "src", "features"),
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: { path: "src/features/dashboard" },
    });
  }, 120_000);
});

describe("deps unresolved imports (M-056 / P-A1)", () => {
  const unresolvedFixture = join(
    packageDir,
    "..",
    "intelligence",
    "fixtures",
    "m056-unresolved",
  );

  afterAll(async () => {
    await rm(join(unresolvedFixture, ".prism"), {
      recursive: true,
      force: true,
    });
  });

  it("includes unresolvedImports on the deps JSON payload", async () => {
    const result = await runCli([
      "deps",
      "--workspace",
      unresolvedFixture,
      "--json",
    ]);
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      data: { unresolvedImports?: { count: number; sample: string[] } };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.unresolvedImports?.count).toBeGreaterThan(0);
    expect(payload.data.unresolvedImports?.sample[0]).toContain(
      "no-such-module",
    );
  }, 120_000);

  it("prints an unresolved-imports footnote in human mode", async () => {
    const result = await runCli(["deps", "--workspace", unresolvedFixture]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Unresolved imports:\s*\d+/i);
    expect(result.stdout).toContain("no-such-module");
  }, 120_000);
});

describe("prism agents-md (M-073 Living AGENTS.md)", () => {
  it("generates under PRISM_HOME and passes its own check, never touching the repo", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-cli-home-"));
    try {
      const generated = await runCli(
        ["agents-md", "generate", "--workspace", fixture, "--json"],
        { PRISM_HOME: home },
      );
      expect(generated.code).toBe(0);
      const generatedPayload = JSON.parse(generated.stdout) as {
        ok: boolean;
        data: { path: string; content: string };
      };
      expect(generatedPayload.ok).toBe(true);
      expect(generatedPayload.data.path.startsWith(home)).toBe(true);
      expect(generatedPayload.data.content).toContain("AGENTS.md");

      const checked = await runCli(
        ["agents-md", "check", "--workspace", fixture, "--json"],
        { PRISM_HOME: home },
      );
      expect(checked.code).toBe(0);
      const checkedPayload = JSON.parse(checked.stdout) as {
        ok: boolean;
        data: { ok: boolean; issues: unknown[] };
      };
      expect(checkedPayload.data.ok).toBe(true);
      expect(checkedPayload.data.issues).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }, 120_000);

  it("fails usage-style (exit 2) for an unknown action", async () => {
    const result = await runCli([
      "agents-md",
      "not-a-real-action",
      "--workspace",
      fixture,
    ]);
    expect(result.code).toBe(2);
  }, 120_000);
});

describe("prism findings (M-074 Bloat)", () => {
  afterAll(async () => {
    await rm(join(fixture, ".prism", "finding-mutes.json"), { force: true });
  });

  it("lists findings, then mutes and unmutes one by fingerprint", async () => {
    const listed = await runCli([
      "findings",
      "list",
      "--workspace",
      fixture,
      "--json",
    ]);
    expect(listed.code).toBe(0);
    const listedPayload = JSON.parse(listed.stdout) as {
      ok: boolean;
      data: { findings: { fingerprint: string }[] };
    };
    expect(listedPayload.ok).toBe(true);
    const fingerprint = listedPayload.data.findings[0]?.fingerprint;
    expect(fingerprint).toBeTruthy();
    if (!fingerprint) return;

    const muted = await runCli([
      "findings",
      "mute",
      fingerprint,
      "--workspace",
      fixture,
      "--json",
    ]);
    expect(muted.code).toBe(0);
    const mutedPayload = JSON.parse(muted.stdout) as {
      data: { muted: string[] };
    };
    expect(mutedPayload.data.muted).toContain(fingerprint);

    const afterMute = await runCli([
      "findings",
      "list",
      "--workspace",
      fixture,
      "--json",
    ]);
    const afterMutePayload = JSON.parse(afterMute.stdout) as {
      data: { findings: { fingerprint: string }[] };
    };
    expect(
      afterMutePayload.data.findings.some((f) => f.fingerprint === fingerprint),
    ).toBe(false);

    const unmuted = await runCli([
      "findings",
      "unmute",
      fingerprint,
      "--workspace",
      fixture,
      "--json",
    ]);
    expect(unmuted.code).toBe(0);
    const unmutedPayload = JSON.parse(unmuted.stdout) as {
      data: { muted: string[] };
    };
    expect(unmutedPayload.data.muted).not.toContain(fingerprint);
  }, 120_000);

  it("fails usage-style (exit 2) for an unknown action", async () => {
    const result = await runCli([
      "findings",
      "not-a-real-action",
      "--workspace",
      fixture,
    ]);
    expect(result.code).toBe(2);
  }, 120_000);
});
