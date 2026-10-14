/**
 * Point every local Prism host at this checkout (ADR-0061).
 *
 * Idempotent. Backs up each file it edits under ~/.prism/backup/<timestamp>/.
 * Restore with `bun run dev:unlink`.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeBin = process.execPath;
const mcpBin = join(repo, "packages", "mcp-server", "dist", "bin.js");
const pack = join(repo, "packages", "plugin", "dist", "dev-pack");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(homedir(), ".prism", "backup", stamp);

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: repo,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`dev:link: ${command} ${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }
}

function save(path) {
  if (!existsSync(path)) return;
  const dest = join(backup, path.replace(homedir(), "home"));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(path, dest);
}

mkdirSync(backup, { recursive: true });
writeFileSync(
  join(backup, "README.txt"),
  `Restore with: bun run dev:unlink ${stamp}\n`,
);

console.log(`dev:link: building with ${nodeBin}`);

// The native SQLite module must match the Node that launches the MCP server.
const probe = spawnSync(
  nodeBin,
  ["-e", "new (require('better-sqlite3'))(':memory:')"],
  { cwd: join(repo, "packages", "indexer"), encoding: "utf8" },
);
if (probe.status !== 0) {
  console.log("dev:link: rebuilding better-sqlite3 for this Node");
  const resolved = spawnSync(
    nodeBin,
    ["-p", "require.resolve('better-sqlite3/package.json')"],
    { cwd: join(repo, "packages", "indexer"), encoding: "utf8" },
  );
  const sqliteDir = dirname(resolved.stdout.trim());
  const rebuilt = spawnSync(
    "npx",
    ["--yes", "node-gyp", "rebuild", "--release"],
    {
      cwd: sqliteDir,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${dirname(nodeBin)}:${process.env.PATH ?? ""}`,
      },
    },
  );
  if (rebuilt.status !== 0) {
    console.error("dev:link: better-sqlite3 rebuild failed");
    process.exit(1);
  }
}
run("bun", ["run", "--filter", "@repo-prism/mcp-server", "build"]);
run("bun", ["run", "--filter", "@repo-prism/plugin", "build"], {
  PRISM_DEV_PACK: "1",
  PRISM_DEV_NODE: nodeBin,
  PRISM_MCP_BIN: mcpBin,
});

if (!existsSync(mcpBin)) {
  console.error(`dev:link: missing ${mcpBin}`);
  process.exit(1);
}

const version = JSON.parse(
  readFileSync(join(repo, "packages", "mcp-server", "package.json"), "utf8"),
).version;

const installedPath = join(
  homedir(),
  ".claude",
  "plugins",
  "installed_plugins.json",
);
save(installedPath);
const installed = existsSync(installedPath)
  ? JSON.parse(readFileSync(installedPath, "utf8"))
  : { version: 2, plugins: {} };
installed.plugins ??= {};
const rows = installed.plugins?.["prism@local"] ?? [];
const previous = rows[0]?.installPath;
const linkPath =
  previous ??
  join(
    homedir(),
    ".claude",
    "plugins",
    "cache",
    "prism-local",
    "prism",
    version,
  );
if (existsSync(linkPath)) {
  const parked = join(backup, "plugin-previous");
  mkdirSync(dirname(parked), { recursive: true });
  renameSync(linkPath, parked);
}
mkdirSync(dirname(linkPath), { recursive: true });
symlinkSync(pack, linkPath);
installed.plugins["prism@local"] = [
  {
    ...(rows[0] ?? { scope: "user" }),
    scope: "user",
    installPath: linkPath,
    version,
    lastUpdated: new Date().toISOString(),
  },
];
mkdirSync(dirname(installedPath), { recursive: true });
writeFileSync(installedPath, `${JSON.stringify(installed, null, 2)}\n`);
console.log(
  `dev:link: plugin → ${linkPath} → ${readlinkSync(linkPath)} (${version})`,
);

const cursorMcp = join(homedir(), ".cursor", "mcp.json");
if (existsSync(cursorMcp)) {
  save(cursorMcp);
  const cursor = JSON.parse(readFileSync(cursorMcp, "utf8"));
  if (cursor.mcpServers?.prism) {
    delete cursor.mcpServers.prism;
    writeFileSync(cursorMcp, `${JSON.stringify(cursor, null, 2)}\n`);
    console.log(
      "dev:link: removed the extra prism server from ~/.cursor/mcp.json",
    );
  }
}

const claudeSettings = join(homedir(), ".claude", "settings.json");
if (existsSync(claudeSettings)) {
  save(claudeSettings);
  const settings = JSON.parse(readFileSync(claudeSettings, "utf8"));
  const dropPrism = (value) => {
    if (Array.isArray(value))
      return value.map(dropPrism).filter((item) => item !== null);
    if (!value || typeof value !== "object") return value;
    if (
      typeof value.command === "string" &&
      value.command.includes("prism-hook.mjs")
    ) {
      return null;
    }
    const next = {};
    for (const [key, child] of Object.entries(value))
      next[key] = dropPrism(child);
    return next;
  };
  if (settings.hooks) settings.hooks = dropPrism(settings.hooks);
  writeFileSync(claudeSettings, `${JSON.stringify(settings, null, 2)}\n`);
  console.log("dev:link: hooks now come from the plugin pack only");
}

const extensions = join(homedir(), ".cursor", "extensions");
if (existsSync(extensions)) {
  for (const name of readdirSync(extensions)) {
    if (!name.startsWith("prismhq.repo-prism")) continue;
    const from = join(extensions, name);
    const dest = join(backup, "extensions", name);
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(from, dest);
    console.log(`dev:link: moved Marketplace extension ${name} aside`);
  }
}

console.log(`dev:link: backup ${backup}`);
console.log(
  "dev:link: reload Cursor and Claude Code, then run: prism doctor --surfaces",
);
