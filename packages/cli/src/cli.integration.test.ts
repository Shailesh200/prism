import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
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
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binary, ...args], {
      env: { ...process.env, ...env },
      cwd,
    });

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

  it("exits 0 and prints help when given no command", async () => {
    const result = await runCli([]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("Usage:");
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
    const result = await runCli(["dna", "--workspace", fixture, "--json"]);
    expect(result.code).toBe(0);

    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      data: { languages: unknown[] };
    };
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.data.languages)).toBe(true);
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
    const result = await runCli(["dna", "--workspace", missing, "--json"]);

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
    const result = await runCli(["dna", "--workspace", missing]);

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
    const result = await runCli(["dna", "--workspace", fixture, "--json"]);
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
      ["an unknown flag", ["dna", "--nope"]],
      ["a bad --zoom value", ["map", "--zoom", "repository"]],
      ["a bad --fail-on value", ["health", "--fail-on", "catastrophic"]],
      ["a bad --limit value", ["cycles", "--limit", "0"]],
    ];

    for (const [name, argv] of cases) {
      it(name, async () => {
        const result = await runCli([...argv, "--workspace", fixture]);
        expect(result.code, `${argv.join(" ")}\n${result.stderr}`).toBe(2);
        expect(result.stdout).toBe("");
      }, 60_000);
    }
  });

  it("still exits 0 for help on a subcommand", async () => {
    const result = await runCli(["map", "--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--zoom");
  });

  it("names the valid values when a choice flag is wrong", async () => {
    // A rejection that does not say what would have worked leaves the user
    // guessing at a closed set the CLI already knows.
    const result = await runCli([
      "map",
      "--zoom",
      "repository",
      "--workspace",
      fixture,
    ]);
    expect(result.stderr).toContain("repo, package, feature, file, symbol");
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
  // Reads an ingested build artifact rather than the source tree, so there is
  // nothing to point it at in a fixture that has never been built.
  bundle: [],
  completions: ["bash"],
};

/** Commands that cannot succeed on a fixture without extra setup. */
const EXPECT_FAILURE = new Set(["bundle"]);

describe("every command (M-029)", () => {
  afterAll(async () => {
    await rm(join(fixture, ".prism"), { recursive: true, force: true });
  });

  it.each(COMMANDS.map((command) => command.name))(
    "%s produces a valid JSON envelope and nothing else on stdout",
    async (name) => {
      const result = await runCli([
        name,
        ...(ARGUMENTS[name] ?? []),
        "--workspace",
        fixture,
        "--json",
      ]);

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
        { COLUMNS: "80" },
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
