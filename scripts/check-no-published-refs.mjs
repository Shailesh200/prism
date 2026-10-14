#!/usr/bin/env node
/**
 * `no-published-refs` contract (plan §3.0, DEV-2). Until 2.0.0 is released,
 * nothing that launches or tests Prism may reach the registry: no `npx` or
 * `bunx` of an @repo-prism package, no `@repo-prism/<pkg>@<version|tag>`.
 * Scans the built plugin pack, hooks, the Action, CI workflows, benchmark and
 * harness configs, and test fixtures. User docs and the publish script are
 * out of scope (they describe the released install).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
export const PUBLISHED_REF =
  /\b(?:npx|bunx|pnpm\s+dlx|yarn\s+dlx)\b[^\n]{0,60}@repo-prism\/|@repo-prism\/[a-z-]+@(?:latest|next|[\^~]?\d)/;

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
];
const BUILT = ["packages/plugin/dist/pack"];

const hits = [];
const grep = spawnSync(
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
if (grep.status !== 0 && grep.status !== 1) {
  console.error(grep.stderr);
  process.exit(2);
}
hits.push(...grep.stdout.split("\n").filter(Boolean));

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
