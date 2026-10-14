/**
 * Start Vite on the Node that can dlopen better-sqlite3.
 *
 * `bun run vite` / PATH `node` often resolve to Cursor's helper Node, whose
 * ABI does not match the compiled addon — Build history then no-ops.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const app = join(scriptDir, "..");
const repoRoot = join(app, "../..");
const DEFAULT_NODE_VERSION = "24.18.1";
const exe = process.platform === "win32" ? "node.exe" : "node";

function nvmrcVersion(dir) {
  try {
    const raw = readFileSync(join(dir, ".nvmrc"), "utf8").trim();
    return raw.replace(/^v/, "") || undefined;
  } catch {
    return undefined;
  }
}

function nvmNodeBin(version) {
  const nvmDir = process.env.NVM_DIR?.trim() || join(homedir(), ".nvm");
  return join(nvmDir, "versions", "node", `v${version}`, "bin", exe);
}

function canDlopenSqlite(nodeBin) {
  const indexerPkg = join(repoRoot, "packages/indexer/package.json");
  const script = `
    import { createRequire } from "node:module";
    import { pathToFileURL } from "node:url";
    const req = createRequire(pathToFileURL(${JSON.stringify(indexerPkg)}).href);
    const Database = req("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
  `;
  const result = spawnSync(nodeBin, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 8000,
  });
  return result.status === 0;
}

function resolveNode() {
  const override = process.env.PRISM_NODE?.trim();
  if (override && existsSync(override)) return override;

  const pinned =
    process.env.PRISM_NODE_VERSION?.trim() ||
    nvmrcVersion(repoRoot) ||
    DEFAULT_NODE_VERSION;
  const nvmDir = process.env.NVM_DIR?.trim() || join(homedir(), ".nvm");
  const versions = new Set([pinned]);
  try {
    for (const name of readdirSync(join(nvmDir, "versions", "node"))) {
      versions.add(name.replace(/^v/, ""));
    }
  } catch {
    /* no nvm dir */
  }

  const candidates = [];
  for (const version of versions) {
    candidates.push(nvmNodeBin(version));
    candidates.push(
      join(homedir(), ".proto", "tools", "node", version, "bin", exe),
    );
  }
  candidates.push(process.execPath, exe);

  const pinnedBin = nvmNodeBin(pinned);
  if (existsSync(pinnedBin) && canDlopenSqlite(pinnedBin)) return pinnedBin;
  for (const candidate of candidates) {
    if (
      candidate !== pinnedBin &&
      existsSync(candidate) &&
      canDlopenSqlite(candidate)
    ) {
      return candidate;
    }
  }
  if (existsSync(pinnedBin)) return pinnedBin;
  return exe;
}

const nodeBin = resolveNode();
const vite = join(app, "node_modules", "vite", "bin", "vite.js");
const child = spawn(nodeBin, [vite, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: app,
  env: {
    ...process.env,
    PATH: `${dirname(nodeBin)}${delimiter}${process.env.PATH ?? ""}`,
  },
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
