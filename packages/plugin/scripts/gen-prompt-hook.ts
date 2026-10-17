/**
 * Regenerate the dependency-free bundles of `@repo-prism/shared` modules the
 * Claude hook runs in its own process:
 * - `hooks/prompt-hook.mjs` from shared/src/prompt-hook.ts;
 * - `hooks/hook-config.mjs` from shared/src/hook-config.ts (round 4: the
 *   session hook upgrades an old Prism hook config in place).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dir;
const oxfmt = join(here, "..", "..", "..", "node_modules", ".bin", "oxfmt");

const BUNDLES = [
  {
    name: "prompt-hook",
    header: `/**
 * Dependency-free copy of \`@repo-prism/shared/prompt-hook\` for the hook, so a
 * prompt costs one Node process. Generated from
 * packages/shared/src/prompt-hook.ts by \`bun run gen:prompt-hook\`
 * (packages/plugin); \`prompt-hook.contract.test.ts\` holds the two to the same
 * answers. Do not edit by hand: regenerate.
 */
`,
  },
  {
    name: "hook-config",
    header: `/**
 * Dependency-free copy of \`@repo-prism/shared/hook-config\` for the hook, so
 * the session hook can bring an old Prism hook config up to date. Generated
 * from packages/shared/src/hook-config.ts by \`bun run gen:prompt-hook\`
 * (packages/plugin); \`hook-config.contract.test.ts\` holds the two to the
 * same answers. Do not edit by hand: regenerate.
 */
`,
  },
];

for (const bundle of BUNDLES) {
  const out = join(here, "..", "hooks", `${bundle.name}.mjs`);
  const result = await Bun.build({
    entrypoints: [join(here, "..", "..", "shared", "src", `${bundle.name}.ts`)],
    target: "node",
    format: "esm",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  writeFileSync(out, bundle.header + (await result.outputs[0]!.text()));
  // Formatted like the rest of the repo, so `format:check` passes right after a
  // regenerate (round 4 fresh-copy QA found the committed bundle unformatted).
  if (existsSync(oxfmt)) Bun.spawnSync([oxfmt, out]);
  console.log(`wrote ${out} (${readFileSync(out).length} bytes)`);
}
