#!/usr/bin/env node
/**
 * Lockstep versions (plan §9.5 #7). Every published package carries the same
 * version, internal dependencies use `workspace:*`, and PRISM_CORE_VERSION
 * matches. A package that changed cannot be skipped at release.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const problems = [];
const versions = new Map();
for (const dir of readdirSync(join(root, "packages"))) {
  const path = join(root, "packages", dir, "package.json");
  if (!existsSync(path)) continue;
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  if (pkg.private) continue;
  versions.set(pkg.name, pkg.version);
  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
      if (dep.startsWith("@repo-prism/") && spec !== "workspace:*")
        problems.push(
          `${pkg.name} ${field}.${dep} is "${spec}", expected "workspace:*"`,
        );
    }
  }
}
const distinct = new Set(versions.values());
if (distinct.size !== 1)
  problems.push(
    `versions differ: ${[...versions].map(([n, v]) => `${n}@${v}`).join(", ")}`,
  );
const [version] = distinct;
const core = readFileSync(join(root, "packages/core/src/version.ts"), "utf8");
if (!core.includes(`PRISM_CORE_VERSION = "${version}"`))
  problems.push(`PRISM_CORE_VERSION does not match ${version}`);
if (problems.length > 0) {
  for (const line of problems) console.error(`lockstep: ${line}`);
  process.exit(1);
}
console.log(`lockstep: ${versions.size} packages at ${version}`);
