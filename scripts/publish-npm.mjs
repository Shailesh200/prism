/**
 * Publish the public npm surface bottom-up.
 *
 * Package.json files keep `workspace:*` for local Bun installs. This script
 * rewrites those to concrete versions for the publish, then restores them.
 *
 * Usage:
 *   node scripts/publish-npm.mjs --dry-run
 *   node scripts/publish-npm.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORDER = [
  "shared",
  "analyzer",
  "graph-engine",
  "impact",
  "navigation",
  "indexer",
  "intelligence",
  "repository-map",
  "core",
  "dispatch",
  "dispatch-hub",
  "mcp-server",
  "cli",
];

const PUBLISHABLE = new Set(ORDER.map((name) => `@repo-prism/${name}`));
const dryRun = process.argv.includes("--dry-run");
const root = process.cwd();

function fail(message) {
  console.error(`publish-npm: ${message}`);
  process.exit(1);
}

function readPkg(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

function writePkg(dir, pkg) {
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}

function npmVersionExists(name, version) {
  const result = spawnSync("npm", ["view", `${name}@${version}`, "version"], {
    encoding: "utf8",
    env: process.env,
  });
  return result.status === 0 && result.stdout.trim() === version;
}

/** Rewrite workspace protocol deps that we also publish to their package versions. */
function forPublish(pkg, versions) {
  const next = structuredClone(pkg);
  delete next.private;
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const deps = next[field];
    if (!deps) continue;
    for (const [dep, ver] of Object.entries(deps)) {
      if (!PUBLISHABLE.has(dep)) continue;
      if (String(ver).startsWith("workspace:")) {
        deps[dep] = versions.get(dep) ?? "1.0.0";
      }
    }
  }
  // Dev workspace deps (e.g. test-support) must not ship as registry versions
  // we never published — drop them from the published manifest.
  if (next.devDependencies) {
    for (const dep of Object.keys(next.devDependencies)) {
      if (
        dep.startsWith("@repo-prism/") &&
        String(next.devDependencies[dep]).startsWith("workspace:")
      ) {
        delete next.devDependencies[dep];
      }
    }
    if (Object.keys(next.devDependencies).length === 0) {
      delete next.devDependencies;
    }
  }
  return next;
}

const versions = new Map();
for (const name of ORDER) {
  const pkg = readPkg(join(root, "packages", name));
  versions.set(pkg.name, pkg.version);
}

for (const name of ORDER) {
  const dir = join(root, "packages", name);
  const original = readPkg(dir);
  if (original.private === true) {
    fail(
      `${original.name} is still private — remove private before publishing`,
    );
  }
  if (npmVersionExists(original.name, original.version)) {
    console.log(
      `\n=== skip ${original.name}@${original.version} (already on npm) ===`,
    );
    continue;
  }
  if (!existsSync(join(dir, "dist"))) {
    fail(`${original.name} has no dist/ — run bun run build first`);
  }

  const published = forPublish(original, versions);
  writePkg(dir, published);

  const args = ["publish", "--access", "public"];
  if (dryRun) args.push("--dry-run");

  console.log(
    `\n=== ${dryRun ? "dry-run " : ""}publish ${published.name}@${published.version} ===`,
  );
  const result = spawnSync("npm", args, {
    cwd: dir,
    stdio: "inherit",
    env: process.env,
  });

  writePkg(dir, original);

  if (result.status !== 0) {
    fail(`npm publish failed for ${original.name} (exit ${result.status})`);
  }
}

console.log(
  dryRun
    ? "\npublish-npm: dry-run ok"
    : "\npublish-npm: all packages published. Try:\n  npx -y @repo-prism/cli doctor\n  claude mcp add prism -- npx -y @repo-prism/mcp-server",
);
