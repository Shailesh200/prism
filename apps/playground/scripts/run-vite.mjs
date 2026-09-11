/**
 * Start Vite on the Node that can dlopen better-sqlite3.
 *
 * `bun run vite` / PATH `node` often resolve to Cursor's helper Node, whose
 * ABI does not match the compiled addon — Build history then no-ops.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const app = join(scriptDir, "..");
const repoRoot = join(app, "../..");
const DEFAULT_NODE_VERSION = "26.5.0";
const exe = process.platform === "win32" ? "node.exe" : "node";

function nvmrcVersion(dir) {
  try {
    const raw = readFileSync(join(dir, ".nvmrc"), "utf8").trim();
    return raw.replace(/^v/, "") || undefined;
  } catch {
    return undefined;
  }
}

function resolveNode() {
  const override = process.env.PRISM_NODE?.trim();
  if (override && existsSync(override)) return override;
  const version =
    process.env.PRISM_NODE_VERSION?.trim() ||
    nvmrcVersion(repoRoot) ||
    DEFAULT_NODE_VERSION;
  const nvmDir = process.env.NVM_DIR?.trim() || join(homedir(), ".nvm");
  const candidates = [
    join(nvmDir, "versions", "node", `v${version}`, "bin", exe),
    join(homedir(), ".proto", "tools", "node", version, "bin", exe),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
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
