import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

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
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binary, ...args], {
      env: { ...process.env, ...env },
      cwd: packageDir,
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

  it("exits 2 and prints help when given no command", async () => {
    const result = await runCli([]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage:");
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
    expect(result.stdout).toMatch(/via --workspace/);
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
    expect(result.stdout).toContain("via PRISM_WORKSPACE");
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
});
