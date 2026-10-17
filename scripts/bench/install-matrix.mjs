#!/usr/bin/env node
/**
 * B10 install matrix (plan P21): for each host, install into an isolated HOME,
 * run `prism doctor`, and fire one sample hook payload when the host has hooks.
 *
 *   node scripts/bench/install-matrix.mjs [--out DIR] [--hosts claude,cursor,...]
 *
 * Exit 0 only when every cell passes. Writes B10-install-matrix.json.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(join(fileURLToPath(import.meta.url), "..", "..", ".."));
const cli = join(root, "packages/cli/dist/cli.js");
const HOSTS = ["claude", "cursor", "codex", "opencode"];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const outDir = resolve(arg("out", join(tmpdir(), "prism-b10")));
const hostFilter = (arg("hosts", HOSTS.join(",")) || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

if (!existsSync(cli)) {
  console.error(`B10: missing ${cli}; build the CLI first`);
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });

/** Seed the minimal marker so install treats the host as present. */
function seedHost(home, host) {
  const markers = {
    claude: () => {
      mkdirSync(join(home, ".claude"), { recursive: true });
      writeFileSync(join(home, ".claude.json"), "{}\n");
    },
    cursor: () => mkdirSync(join(home, ".cursor"), { recursive: true }),
    codex: () => mkdirSync(join(home, ".codex"), { recursive: true }),
    opencode: () =>
      mkdirSync(join(home, ".config", "opencode"), { recursive: true }),
  };
  markers[host]();
}

function runPrism(args, env, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    env: { ...process.env, ...env },
    cwd,
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error) : null,
  };
}

/** Minimal SessionStart-shaped payload Claude Code hooks accept. */
const SAMPLE_HOOK_PAYLOAD = JSON.stringify({
  hook_event_name: "SessionStart",
  cwd: root,
  session_id: "b10-install-matrix",
});

/**
 * The `prism-hook.mjs` path inside a settings value. A command string such as
 * `node /…/prism-hook.mjs` yields the path, including a Windows `D:\…` path.
 */
function hookPathFrom(text) {
  const win = text.match(/[A-Za-z]:\\(?:[^"'\r\n])*prism-hook\.mjs/);
  if (win) return win[0];
  const unix = text.match(/\/[^"'\s]*prism-hook\.mjs/);
  return unix ? unix[0] : null;
}

/** A hook command path from settings, including Windows `D:\…` paths. */
function hookCommand(value) {
  if (typeof value === "string") {
    return hookPathFrom(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = hookCommand(item);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = hookCommand(item);
      if (found) return found;
    }
  }
  return null;
}

function fireHook(home, host, env) {
  if (host !== "claude") {
    return { skipped: true, reason: "no SessionStart hook for this host" };
  }
  const hook = join(home, ".claude", "hooks", "prism-hook.mjs");
  // Install may place hooks under the plugin pack path recorded in settings.
  const candidates = [
    hook,
    join(home, ".claude", "plugins", "prism", "hooks", "prism-hook.mjs"),
  ];
  // Also search settings for a hook command path.
  let settingsHook = null;
  const settingsPath = join(home, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      settingsHook = hookCommand(settings?.hooks);
    } catch {
      /* ignore */
    }
  }
  const path = [settingsHook, ...candidates].find((p) => p && existsSync(p));
  if (!path) {
    return { ok: false, reason: "prism-hook.mjs not found after install" };
  }
  const result = spawnSync(process.execPath, [path], {
    env: { ...process.env, ...env, HOME: home },
    cwd: root,
    input: SAMPLE_HOOK_PAYLOAD,
    encoding: "utf8",
    timeout: 15_000,
  });
  const code = result.status ?? 1;
  // SessionStart with no/stale snapshot answers {} — that is success for B10.
  const out = (result.stdout ?? "").trim();
  let parsedOk = false;
  try {
    JSON.parse(out || "{}");
    parsedOk = true;
  } catch {
    parsedOk = false;
  }
  return {
    ok: code === 0 && parsedOk,
    code,
    stdout: out.slice(0, 200),
    stderr: (result.stderr ?? "").slice(0, 200),
    hook: path,
  };
}

const cells = [];
for (const host of hostFilter) {
  if (!HOSTS.includes(host)) {
    cells.push({ host, status: "fail", error: `unknown host ${host}` });
    continue;
  }
  const home = mkdtempSync(join(tmpdir(), `prism-b10-${host}-`));
  const env = {
    HOME: home,
    PRISM_HOME: join(home, ".prism"),
    PRISM_DAEMON: "0",
  };
  const cell = { host, home, status: "fail" };
  try {
    seedHost(home, host);
    const install = runPrism(
      ["install", host, "--user", "--local", root],
      env,
      root,
    );
    cell.install = {
      code: install.code,
      stdout: install.stdout.slice(0, 400),
      stderr: install.stderr.slice(0, 400),
    };
    if (install.code !== 0) {
      cell.error = "install failed";
      cells.push(cell);
      continue;
    }
    const doctor = runPrism(["doctor", "--workspace", root], env, root);
    cell.doctor = {
      code: doctor.code,
      stdout: doctor.stdout.slice(0, 600),
      stderr: doctor.stderr.slice(0, 200),
    };
    if (doctor.code !== 0) {
      cell.error = "doctor failed";
      cells.push(cell);
      continue;
    }
    if (!/Prism doctor/i.test(doctor.stdout)) {
      cell.error = "doctor output missing heading";
      cells.push(cell);
      continue;
    }
    const hook = fireHook(home, host, env);
    cell.hook = hook;
    if (hook.skipped) {
      cell.status = "pass";
    } else if (hook.ok) {
      cell.status = "pass";
    } else {
      cell.error = hook.reason ?? "hook failed";
      cells.push(cell);
      continue;
    }
    cell.status = "pass";
    cells.push(cell);
  } catch (error) {
    cell.error = String(error);
    cells.push(cell);
  } finally {
    // Keep failing homes for inspection; wipe passes to save disk.
    if (cell.status === "pass") {
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

const report = {
  id: "B10",
  generatedAt: new Date().toISOString(),
  root,
  os: process.platform,
  cells,
  pass: cells.filter((c) => c.status === "pass").length,
  fail: cells.filter((c) => c.status === "fail").length,
};
const outPath = join(outDir, "B10-install-matrix.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

for (const cell of cells) {
  const mark = cell.status === "pass" ? "PASS" : "FAIL";
  console.log(
    `${mark}  ${cell.host.padEnd(10)} ${cell.error ?? "install+doctor"}${cell.hook && !cell.hook.skipped ? "+hook" : ""}`,
  );
}
console.log(`B10: ${report.pass}/${cells.length} pass → ${outPath}`);
process.exit(report.fail ? 1 : 0);
