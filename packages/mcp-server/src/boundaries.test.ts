import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOOLS } from "./tools.js";

/**
 * Two rules that break a stdio MCP server quietly rather than loudly, so each
 * gets a test rather than a comment.
 */

const srcDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(srcDir, "..");

async function sourceFiles(): Promise<string[]> {
  const entries = await readdir(srcDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => join(srcDir, e.name));
}

describe("package boundaries (ADR-0004)", () => {
  /** Engines the server must reach only through Core. */
  const ENGINES = [
    "@prism/analyzer",
    "@prism/indexer",
    "@prism/graph-engine",
    "@prism/intelligence",
    "@prism/impact",
    "@prism/navigation",
    "@prism/repository-map",
  ];

  it("imports no engine package, in source or in tests", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      const text = await readFile(file, "utf8");
      for (const engine of ENGINES) {
        // Matches the import specifier, not a mention — otherwise this file's
        // own ENGINES list would fail the test it defines.
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

describe("stdout discipline", () => {
  it("never writes to stdout outside the protocol", async () => {
    // stdout belongs to the MCP frame stream. One console.log anywhere in this
    // process and the client sees a parse error instead of whatever was logged.
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      if (file.endsWith(".test.ts")) continue;
      const text = await readFile(file, "utf8");
      if (/console\.(log|info|debug|warn|error)\s*\(/.test(text)) {
        offenders.push(`${file}: console.*`);
      }
      if (/process\.stdout\.write/.test(text)) {
        offenders.push(`${file}: process.stdout.write`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("consent (ADR-0024)", () => {
  it("exposes no tool that could reach the network or spawn a build", () => {
    // An agent cannot give informed consent on the user's behalf, so the
    // consent-gated Core paths are simply not reachable from MCP. This test is
    // the guard for M-027, where the temptation to add one will be real.
    const CONSENT_GATED = [
      "stageDevopsRemote",
      "startUtilityJob",
      "runWorkspaceTests",
      "detectBundleAnalyzeCapability",
      "setConsent",
    ];

    const bodies = TOOLS.map((tool) => tool.call.toString());
    const offenders = bodies.flatMap((body, i) =>
      CONSENT_GATED.filter((method) => body.includes(method)).map(
        (method) => `${TOOLS[i]?.name} → ${method}`,
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("declares every tool read-only", () => {
    expect(TOOLS.every((tool) => tool.readOnly !== false)).toBe(true);
  });
});
