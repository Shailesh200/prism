import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "./commands.js";

const srcDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(srcDir, "..");

async function sourceFiles(dir: string = srcDir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const ENGINES = [
  "@repo-prism/analyzer",
  "@repo-prism/indexer",
  "@repo-prism/graph-engine",
  "@repo-prism/intelligence",
  "@repo-prism/impact",
  "@repo-prism/navigation",
  "@repo-prism/repository-map",
];

describe("package boundaries (ADR-0004)", () => {
  it("imports no engine package", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      const text = await readFile(file, "utf8");
      for (const engine of ENGINES) {
        if (new RegExp(String.raw`from\s+"${engine}"`).test(text)) {
          offenders.push(`${file} → ${engine}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reaches no consent-gated Core path without --yes", async () => {
    // The CLI is analysis-only today, so the honest guard is that nothing
    // touches a gated method at all. `--yes` exists for the day one does: it
    // must be read explicitly, because a flag nobody checks is not consent
    // (M-036 Phase 1.7).
    const GATED = [
      "stageDevopsRemote",
      "fetchGithubWorkflows",
      "fetchGithubWorkflowRuns",
      "fetchGithubRepo",
      "fetchGithubAuthenticatedLogin",
      "testGithubRepoConnection",
      "dispatchGithubWorkflow",
      "fetchPagespeedMetrics",
      "startUtilityJob",
      "runWorkspaceTests",
      "setConsent",
    ];
    const offenders: string[] = [];
    for (const file of await sourceFiles(join(srcDir, "commands"))) {
      const text = await readFile(file, "utf8");
      for (const method of GATED) {
        if (text.includes(`.${method}(`) && !text.includes(`flag("yes")`)) {
          offenders.push(`${file} → ${method}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares no engine package as a dependency", async () => {
    const manifest = JSON.parse(
      await readFile(join(packageDir, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    });
    expect(declared.filter((name) => ENGINES.includes(name))).toEqual([]);
  });
});

/**
 * Comments discuss these rules at length, so a raw text search would flag the
 * explanation as the violation. Only code lines count.
 */
async function codeLines(file: string): Promise<string[]> {
  const text = await readFile(file, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        !line.startsWith("//") &&
        !line.startsWith("*") &&
        !line.startsWith("/*"),
    );
}

describe("stdout discipline (M-028)", () => {
  it("writes to stdout in exactly one place", async () => {
    // stdout carries data. If a command ever writes to it directly, `--json`
    // stops being parseable and the failure shows up in someone's pipeline
    // rather than in a test.
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      if (file.endsWith(".test.ts")) continue;
      if (file.endsWith("output.ts")) continue; // the one writer
      const lines = await codeLines(file);
      if (
        lines.some((line) => /console\.log|process\.stdout\.write/.test(line))
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("calls process.exit nowhere, so exit codes stay testable", async () => {
    // `process.exitCode = …` is fine; `process.exit()` truncates pending
    // stdout writes, which is how a JSON payload arrives half-written.
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      const lines = await codeLines(file);
      if (lines.some((line) => /process\.exit\(/.test(line))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("command pack coherence (M-029)", () => {
  it("documents every command in the README, and no others", async () => {
    // The README is the CLI's contract with a user who has not run `--help`.
    // Without this test it drifts on the first command that ships in a hurry.
    const readme = await readFile(join(packageDir, "README.md"), "utf8");
    const documented = new Set(
      [...readme.matchAll(/^\| `prism ([a-z-]+)/gm)].map((match) => match[1]),
    );

    const implemented = COMMANDS.map((command) => command.name);
    expect([...documented].sort()).toEqual([...implemented].sort());
  });

  it("names commands consistently, so they are guessable", () => {
    for (const command of COMMANDS) {
      expect(command.name).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  it("gives every command a distinct name", () => {
    const names = COMMANDS.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("summarises every command in a sentence a user can act on", () => {
    for (const command of COMMANDS) {
      // Long enough to say something the name does not. `prism --help` is the
      // only documentation many users will read.
      expect(`${command.name}: ${command.summary.split(/\s+/).length}`).toBe(
        `${command.name}: ${Math.max(4, command.summary.split(/\s+/).length)}`,
      );
      expect(command.summary).not.toBe(command.name);
    }
  });

  it("gives every command at least one example", () => {
    for (const command of COMMANDS) {
      expect(command.examples?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("spells the shared options identically wherever they appear", () => {
    // Two commands describing `--limit` differently is how a CLI starts
    // feeling like several CLIs wearing one name.
    const byFlag = new Map<string, Set<string>>();
    for (const command of COMMANDS) {
      for (const option of command.options ?? []) {
        const seen = byFlag.get(option.flags) ?? new Set();
        seen.add(option.description);
        byFlag.set(option.flags, seen);
      }
    }
    for (const [flags, descriptions] of byFlag) {
      expect(`${flags}: ${descriptions.size}`).toBe(`${flags}: 1`);
    }
  });

  it("never hard-codes a risk threshold, leaving riskToBand as the only source", async () => {
    // M-051 Phase 3 unified the bands. A literal 60 or 20 in a comparison here
    // would quietly re-fork them.
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      if (file.endsWith(".test.ts")) continue;
      if (file.endsWith("thresholds.ts")) continue; // asks the shared helper
      for (const line of await codeLines(file)) {
        if (/[<>]=?\s*(60|20)\b/.test(line)) offenders.push(`${file}: ${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
