import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
  "@prism/analyzer",
  "@prism/indexer",
  "@prism/graph-engine",
  "@prism/intelligence",
  "@prism/impact",
  "@prism/navigation",
  "@prism/repository-map",
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
