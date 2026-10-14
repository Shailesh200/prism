/**
 * Emit the Prism plugin pack (ADR-0050).
 *
 * Manifests are generated from `definition.ts`; skills and commands are copied
 * verbatim, because they are prose and belong in markdown a human can read and
 * diff. The build refuses to emit a pack whose definition and directory
 * disagree — a pack missing a skill still installs, and the user finds out by
 * the skill never firing.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  claudeHooks,
  claudeManifest,
  cursorManifest,
  devClaudeHooks,
  devMcpConfig,
  mcpConfig,
  pluginDefinition,
} from "../src/definition.js";
import { readPackDir } from "../src/pack.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The dev pack has its own folder: an ordinary build must never overwrite
// the pack `dev:link` pointed the editors at (ADR-0061).
const out = join(
  root,
  "dist",
  process.env.PRISM_DEV_PACK === "1" ? "dev-pack" : "pack",
);

const mcpPkg = JSON.parse(
  readFileSync(join(root, "../mcp-server/package.json"), "utf8"),
) as { version: string };
const def = pluginDefinition(mcpPkg.version);

const skills = readPackDir(join(root, "skills"), "skill");
const commands = readPackDir(join(root, "commands"), "command");

const missing = [
  ...def.skills.filter((id) => !skills.some((row) => row.id === id)),
  ...def.commands.filter((id) => !commands.some((row) => row.id === id)),
];
const unlisted = [
  ...skills.filter((row) => !def.skills.includes(row.id as never)),
  ...commands.filter((row) => !def.commands.includes(row.id as never)),
].map((row) => row.id);

if (missing.length > 0 || unlisted.length > 0) {
  console.error("plugin: definition and directory disagree");
  if (missing.length > 0)
    console.error(`  declared, absent: ${missing.join(", ")}`);
  if (unlisted.length > 0)
    console.error(`  present, undeclared: ${unlisted.join(", ")}`);
  process.exit(1);
}

// Atomic: build beside the pack, then swap, so hooks that an editor runs from
// dist/pack never see a half-written pack during a rebuild (§10 Phase 7).
const staging = `${out}.staging-${process.pid}`;
rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, ".cursor-plugin"), { recursive: true });
mkdirSync(join(staging, ".claude-plugin"), { recursive: true });

const json = (value: unknown): string =>
  `${JSON.stringify(value, undefined, 2)}\n`;

writeFileSync(
  join(staging, ".cursor-plugin", "plugin.json"),
  json(cursorManifest(def)),
);
writeFileSync(
  join(staging, ".claude-plugin", "plugin.json"),
  json(claudeManifest(def)),
);
const devNode = process.env.PRISM_DEV_NODE?.trim() ?? "";
const devBin = process.env.PRISM_MCP_BIN?.trim() ?? "";
if (process.env.PRISM_DEV_PACK === "1" && (!devNode || !devBin)) {
  console.error(
    "plugin: PRISM_DEV_PACK=1 needs PRISM_DEV_NODE and PRISM_MCP_BIN",
  );
  process.exit(1);
}
const devTarget =
  process.env.PRISM_DEV_PACK === "1" ? { node: devNode, mcpBin: devBin } : null;

writeFileSync(
  join(staging, "mcp.json"),
  json(devTarget ? devMcpConfig(devTarget) : mcpConfig()),
);
writeFileSync(
  join(staging, "README.md"),
  readFileSync(join(root, "README.md"), "utf8"),
);

cpSync(join(root, "skills"), join(staging, "skills"), { recursive: true });
cpSync(join(root, "commands"), join(staging, "commands"), { recursive: true });
mkdirSync(join(staging, "hooks"), { recursive: true });
// The hook imports its prompt classifier as a sibling module.
for (const file of ["prism-hook.mjs", "classify-prompt.mjs"]) {
  cpSync(join(root, "hooks", file), join(staging, "hooks", file));
}
writeFileSync(
  join(staging, "hooks", "hooks.json"),
  json(devTarget ? devClaudeHooks(devTarget) : claudeHooks()),
);

const previous = `${out}.old-${process.pid}`;
if (existsSync(out)) renameSync(out, previous);
renameSync(staging, out);
rmSync(previous, { recursive: true, force: true });

console.log(
  `plugin: pack built — ${def.skills.length} skills, ${def.commands.length} commands, v${def.version}`,
);
