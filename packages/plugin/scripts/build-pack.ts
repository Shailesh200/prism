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
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  claudeManifest,
  cursorManifest,
  mcpConfig,
  pluginDefinition,
} from "../src/definition.js";
import { readPackDir } from "../src/pack.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "pack");

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

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, ".cursor-plugin"), { recursive: true });
mkdirSync(join(out, ".claude-plugin"), { recursive: true });

const json = (value: unknown): string =>
  `${JSON.stringify(value, undefined, 2)}\n`;

writeFileSync(
  join(out, ".cursor-plugin", "plugin.json"),
  json(cursorManifest(def)),
);
writeFileSync(
  join(out, ".claude-plugin", "plugin.json"),
  json(claudeManifest(def)),
);
writeFileSync(join(out, "mcp.json"), json(mcpConfig()));
writeFileSync(
  join(out, "README.md"),
  readFileSync(join(root, "README.md"), "utf8"),
);

cpSync(join(root, "skills"), join(out, "skills"), { recursive: true });
cpSync(join(root, "commands"), join(out, "commands"), { recursive: true });

console.log(
  `plugin: pack built — ${def.skills.length} skills, ${def.commands.length} commands, v${def.version}`,
);
