/**
 * Every integration config must have integration tests (M-037).
 *
 * Before this, fifteen of seventeen packages had a `vitest.integration.config.ts`
 * containing `passWithNoTests: true` and no tests at all. `bun run test:integration`
 * reported success across the whole repository while running four files. The
 * output even said so — "No test files found, exiting with code 0", fifteen
 * times — but a green summary at the end is what people read.
 *
 * So: a package either has integration tests, or it has no integration config.
 * A config with nothing behind it is worse than no config, because it produces
 * a passing result for work that was never done.
 *
 * Which packages should have one is a question with a principled answer. An
 * integration test needs a real repository on disk to analyse, so the layer
 * belongs where something can index one — Core and the surfaces that call it.
 * The engine packages in between (impact, navigation, repository-map,
 * graph-engine, intelligence) consume an index snapshot rather than produce
 * one; their end-to-end behaviour is exercised through Core, and giving them a
 * config of their own produced tests that hand-built a snapshot and therefore
 * tested the same thing their unit tests already did.
 *
 *   bun run scripts/check-test-layers.mjs
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Both workspace roots. The playground lives in `apps/` and had exactly the
// empty config this check exists to find, so scanning only `packages/` would
// have missed the one that was actually hiding.
const WORKSPACE_DIRS = ["packages", "apps"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function integrationTestsIn(dir) {
  const found = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true }).catch(
      () => [],
    );
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (
        entry.name.endsWith(".integration.test.ts") ||
        entry.name.endsWith(".contract.test.ts")
      ) {
        found.push(relative(repoRoot, path));
      }
    }
  }
  await walk(dir);
  return found;
}

const projects = [];
for (const workspace of WORKSPACE_DIRS) {
  const entries = await readdir(join(repoRoot, workspace), {
    withFileTypes: true,
  }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) projects.push(`${workspace}/${entry.name}`);
  }
}
projects.sort();

const problems = [];
const summary = [];

for (const name of projects) {
  const dir = join(repoRoot, name);
  const configPath = join(dir, "vitest.integration.config.ts");
  const hasConfig = await exists(configPath);
  const tests = await integrationTestsIn(join(dir, "src"));

  if (hasConfig && tests.length === 0) {
    problems.push(
      `${name}: has vitest.integration.config.ts but no integration tests.\n` +
        `    Either add one, or delete the config so the gap is honest.`,
    );
    continue;
  }

  if (!hasConfig && tests.length > 0) {
    problems.push(
      `${name}: has ${tests.length} integration test(s) but no ` +
        `vitest.integration.config.ts, so they never run.`,
    );
    continue;
  }

  if (hasConfig) {
    const config = await readFile(configPath, "utf8");
    if (config.includes("passWithNoTests")) {
      problems.push(
        `${name}: integration config sets passWithNoTests, but it has\n` +
          `    ${tests.length} integration test file(s). With the flag on, a run that\n` +
          `    discovers nothing — a broken glob, a renamed file — reports\n` +
          `    success. Remove it so that failure is visible.`,
      );
      continue;
    }
    summary.push(
      `  ${name.padEnd(28)} ${String(tests.length).padStart(2)} file(s)`,
    );
  }
}

if (problems.length > 0) {
  console.error("check-test-layers: FAILED\n");
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}

console.log(
  `check-test-layers: ok (${summary.length} packages with an integration layer)`,
);
for (const line of summary) console.log(line);
