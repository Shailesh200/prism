#!/usr/bin/env node
/**
 * `no-published-refs` contract (plan §3.0, DEV-2). Until 2.0.0 is released,
 * nothing that launches or tests Prism may reach the registry: no `npx` or
 * `bunx` of an @repo-prism package, no `@repo-prism/<pkg>@<version|tag>`.
 * Scans the built plugin pack, hooks, the Action, CI workflows, benchmark and
 * harness configs, and test fixtures. The publish script stays out of scope. Docs and the website are in scope
 * for P20 so they cannot teach npx @latest before release. Outside a git
 * checkout the same paths are scanned directly (scripts/repo-grep.mjs).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  grepFiles,
  inGitWorkTree,
  noGitNote,
  walkRepoFiles,
} from "./repo-grep.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
export const PUBLISHED_REF =
  /\b(?:npx|bunx|pnpm\s+dlx|yarn\s+dlx)\b[^\n]{0,60}@(?:repo-prism|prismapp)\/|@(?:repo-prism|prismapp)\/[a-z-]+@(?:latest|next|[\^~]?\d)/;

const TRACKED = [
  "packages/plugin/hooks",
  "packages/plugin/src",
  "action",
  ".github/workflows",
  "scripts/bench",
  "scripts/e2e-agent",
  "scripts/replay-benchmark.ts",
  ":(glob)packages/**/fixtures/**",
  "packages/test-support",
  ":(glob)**/.mcp.json",
  ":(glob)**/opencode.json",
  ".cursor",
  // Plan P20: site + docs must not teach npx @latest / published tags.
  "apps/website/app",
  "apps/website/components",
  "apps/website/lib",
  "docs",
];
const BUILT = ["packages/plugin/dist/pack"];

/**
 * Sanctioned references: the one hand-wiring snippet users are taught for
 * the released 2.x server (`npx -y @prismapp/mcp-server@2`), allowed only
 * in the files that document and test it. A line passes when it is clean
 * once those exact references are taken out, so anything else on the line
 * (another package, `@latest`, a different version) still fails.
 */
const SANCTIONED_FILES = new Set([
  "docs/start/install.mdx",
  "apps/website/lib/mcp-install.test.ts",
]);
const SANCTIONED_REF = /@prismapp\/mcp-server@2(?![\w.-])/g;

export function sanctioned(hit) {
  const [file, , ...rest] = hit.split(":");
  if (!SANCTIONED_FILES.has(file)) return false;
  return !PUBLISHED_REF.test(rest.join(":").replace(SANCTIONED_REF, ""));
}

/** The TRACKED pathspecs, for the scan without git. */
export function inScope(rel) {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (base === ".mcp.json" || base === "opencode.json") return true;
  if (rel.startsWith("packages/") && rel.includes("/fixtures/")) return true;
  return TRACKED.some(
    (spec) =>
      !spec.startsWith(":") && (rel === spec || rel.startsWith(`${spec}/`)),
  );
}

function scan() {
  if (!inGitWorkTree(root)) {
    console.error(noGitNote("no-published-refs"));
    const files = walkRepoFiles(root).filter(inScope);
    const lines = grepFiles(root, files, (line) => PUBLISHED_REF.test(line));
    return {
      status: lines.length > 0 ? 0 : 1,
      stdout: lines.join("\n"),
      stderr: "",
    };
  }
  return spawnSync(
    "git",
    [
      "grep",
      "-n",
      "-I",
      "-P",
      "--untracked",
      "-e",
      PUBLISHED_REF.source,
      "--",
      ...TRACKED,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 },
  );
}

const hits = [];
const grep = scan();
if (grep.status !== 0 && grep.status !== 1) {
  console.error(grep.stderr);
  process.exit(2);
}
hits.push(
  ...grep.stdout.split("\n").filter((hit) => hit !== "" && !sanctioned(hit)),
);

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(json|mjs|js|md|toml)$/.test(name)) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (PUBLISHED_REF.test(line))
            hits.push(`${relative(root, path)}:${i + 1}:${line.trim()}`);
        });
    }
  }
}
for (const dir of BUILT) if (existsSync(join(root, dir))) walk(join(root, dir));

if (hits.length > 0) {
  console.error(
    "no-published-refs: published package referenced during development:",
  );
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log("no-published-refs: clean");
