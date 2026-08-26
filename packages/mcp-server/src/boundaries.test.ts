import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_NAMES } from "./tools.js";
import { DISPATCH_TOOL_NAMES } from "./dispatch-registry.js";

/**
 * Two rules that break a stdio MCP server quietly rather than loudly, so each
 * gets a test rather than a comment.
 */

const srcDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(srcDir, "..");

/** Recursive: the tool modules live in `src/tools/`, not beside this file. */
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

describe("package boundaries (ADR-0004)", () => {
  /** Engines the server must reach only through Core. */
  const ENGINES = [
    "@repo-prism/analyzer",
    "@repo-prism/indexer",
    "@repo-prism/graph-engine",
    "@repo-prism/intelligence",
    "@repo-prism/impact",
    "@repo-prism/navigation",
    "@repo-prism/repository-map",
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
      "fetchGithubWorkflows",
      "fetchGithubWorkflowRuns",
      "fetchGithubRepo",
      "fetchGithubAuthenticatedLogin",
      "testGithubRepoConnection",
      "dispatchGithubWorkflow",
      "fetchPagespeedMetrics",
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

describe("pack coherence (M-027)", () => {
  it("has no duplicate tool names", () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  it("names every tool in unprefixed snake_case", () => {
    for (const name of TOOL_NAMES) {
      expect(name, name).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
      expect(name.startsWith("prism_"), name).toBe(false);
    }
  });

  it("gives every tool a description an agent can choose from", () => {
    // Short descriptions are how a tool pack becomes unusable: the model
    // cannot tell two tools apart and picks by name similarity.
    for (const tool of TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(80);
      expect(tool.title.length, tool.name).toBeGreaterThan(0);
    }
  });

  it("documents every tool in the README", async () => {
    const readme = await readFile(join(packageDir, "README.md"), "utf8");
    const undocumented = [...TOOL_NAMES, ...DISPATCH_TOOL_NAMES].filter(
      (name) => !readme.includes(`\`${name}\``),
    );
    expect(undocumented).toEqual([]);
  });

  it("claims no tool the README documents but the server lacks", async () => {
    const readme = await readFile(join(packageDir, "README.md"), "utf8");
    const claimed = [...readme.matchAll(/^\| `([a-z][a-z0-9_]*)` \|/gm)].map(
      (match) => match[1] as string,
    );
    const advertised = new Set([...TOOL_NAMES, ...DISPATCH_TOOL_NAMES]);
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed.filter((name) => !advertised.has(name))).toEqual([]);
  });
});
