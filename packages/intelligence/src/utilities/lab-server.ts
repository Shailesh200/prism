/**
 * Discover a reachable local frontend URL, or start a short-lived production
 * preview (build + serve) for Lighthouse mode=run.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { probeLabUrl } from "./lighthouse-runner.js";

/** Ports commonly used by Next / Vite / CRA / Nuxt / static servers. */
export const COMMON_LAB_PORTS: readonly number[] = [
  3000, 3001, 5173, 4173, 8080, 4200, 4321, 5000, 8000,
];

/** Default port when Prism starts its own production preview. */
export const PRISM_LAB_PORT = 4173;

export type LabKind = "next" | "vite" | "nuxt" | "generic";

export type LabServerHandle = {
  readonly url: string;
  readonly port: number;
  readonly kind: LabKind;
  readonly stop: () => Promise<void>;
};

type PkgJson = {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly scripts?: Record<string, string>;
};

function readPkg(root: string): PkgJson | null {
  try {
    return JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as PkgJson;
  } catch {
    return null;
  }
}

function hasDep(pkg: PkgJson | null, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function pathExists(root: string, rel: string): boolean {
  return existsSync(join(root, rel));
}

/** Pick the app root (workspace or common app/ subdirectory). */
export function resolveLabAppRoot(workspaceRoot: string): string {
  const candidates = [
    "",
    "apps/web",
    "apps/frontend",
    "apps/app",
    "web",
    "frontend",
    "app",
  ];
  for (const rel of candidates) {
    const dir = rel ? join(workspaceRoot, rel) : workspaceRoot;
    if (!existsSync(join(dir, "package.json"))) continue;
    const kind = detectLabKind(dir);
    if (kind !== "generic") return dir;
  }
  return workspaceRoot;
}

export function detectLabKind(root: string): LabKind {
  const pkg = readPkg(root);
  if (
    hasDep(pkg, "next") ||
    pathExists(root, "next.config.js") ||
    pathExists(root, "next.config.mjs") ||
    pathExists(root, "next.config.ts") ||
    pathExists(root, "next.config.cjs")
  ) {
    return "next";
  }
  if (
    hasDep(pkg, "nuxt") ||
    pathExists(root, "nuxt.config.ts") ||
    pathExists(root, "nuxt.config.js") ||
    pathExists(root, "nuxt.config.mjs")
  ) {
    return "nuxt";
  }
  if (
    hasDep(pkg, "vite") ||
    pathExists(root, "vite.config.ts") ||
    pathExists(root, "vite.config.js") ||
    pathExists(root, "vite.config.mjs")
  ) {
    return "vite";
  }
  return "generic";
}

function detectRunner(root: string): {
  run: (
    script: string,
    extraArgs?: readonly string[],
  ) => { cmd: string; args: string[] };
  exec: (
    bin: string,
    args: readonly string[],
  ) => { cmd: string; args: string[] };
} {
  const isBun =
    existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"));
  const isPnpm = existsSync(join(root, "pnpm-lock.yaml"));
  const isYarn =
    existsSync(join(root, "yarn.lock")) ||
    existsSync(join(root, ".yarnrc.yml"));

  if (isBun) {
    return {
      run: (script, extra = []) => ({
        cmd: "bun",
        args:
          extra.length > 0 ? ["run", script, "--", ...extra] : ["run", script],
      }),
      exec: (bin, args) => ({ cmd: "bunx", args: [bin, ...args] }),
    };
  }
  if (isPnpm) {
    return {
      run: (script, extra = []) => ({
        cmd: "pnpm",
        args:
          extra.length > 0 ? ["run", script, "--", ...extra] : ["run", script],
      }),
      exec: (bin, args) => ({ cmd: "pnpm", args: ["exec", bin, ...args] }),
    };
  }
  if (isYarn) {
    return {
      run: (script, extra = []) => ({
        cmd: "yarn",
        args:
          extra.length > 0 ? ["run", script, "--", ...extra] : ["run", script],
      }),
      exec: (bin, args) => ({ cmd: "yarn", args: ["exec", bin, ...args] }),
    };
  }
  return {
    run: (script, extra = []) => ({
      cmd: "npm",
      args: ["run", script, "--", ...extra],
    }),
    exec: (bin, args) => ({ cmd: "npx", args: ["--yes", bin, ...args] }),
  };
}

function runOnce(
  cmd: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, [...args], {
      cwd,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout?.on("data", (c: Buffer | string) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c: Buffer | string) => {
      stderr += String(c);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function waitForUrl(
  url: string,
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const probe = await probeLabUrl(url);
    if (probe.ok) return { ok: true };
    last = probe.message;
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    ok: false,
    message: last || `Timed out waiting for ${url}`,
  };
}

function stopChild(child: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.killed || child.exitCode !== null) {
      resolve();
      return;
    }
    const done = (): void => resolve();
    child.once("close", done);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2000);
  });
}

/**
 * Probe preferred port / URL, then common local ports (3000, 5173, …).
 */
export async function discoverLabUrl(options: {
  readonly url?: string;
  readonly port?: number;
}): Promise<
  { ok: true; url: string; port: number } | { ok: false; message: string }
> {
  const preferred = options.port;
  const ports = [
    ...(preferred !== undefined ? [preferred] : []),
    ...COMMON_LAB_PORTS.filter((p) => p !== preferred),
  ];
  const candidates: string[] = [];
  if (options.url?.trim()) candidates.push(options.url.trim());
  for (const port of ports) {
    candidates.push(`http://127.0.0.1:${port}/`, `http://localhost:${port}/`);
  }
  const unique = [...new Set(candidates)];
  const errors: string[] = [];
  for (const candidate of unique) {
    const probe = await probeLabUrl(candidate);
    if (probe.ok) {
      let port = preferred ?? PRISM_LAB_PORT;
      try {
        const u = new URL(candidate);
        port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
      } catch {
        /* keep */
      }
      return { ok: true, url: candidate, port };
    }
    errors.push(probe.message);
  }
  return {
    ok: false,
    message:
      errors[0] ??
      "No local frontend is listening on common ports (3000, 5173, 4173, …).",
  };
}

/**
 * Build + start a production preview on `port`, waiting until HTTP responds.
 * Caller must `stop()` when finished (Lighthouse job finally).
 */
export async function startLabPreviewServer(options: {
  readonly workspaceRoot: string;
  readonly port?: number;
  readonly onProgress?: (message: string) => void;
}): Promise<
  { ok: true; handle: LabServerHandle } | { ok: false; message: string }
> {
  const port = options.port ?? PRISM_LAB_PORT;
  const appRoot = resolveLabAppRoot(options.workspaceRoot);
  const kind = detectLabKind(appRoot);
  const runner = detectRunner(appRoot);
  const url = `http://127.0.0.1:${port}/`;
  const progress = options.onProgress ?? (() => undefined);

  // Already up (race with discover) — reuse without spawning.
  const existing = await probeLabUrl(url);
  if (existing.ok) {
    return {
      ok: true,
      handle: {
        url,
        port,
        kind,
        stop: async () => undefined,
      },
    };
  }

  const pkg = readPkg(appRoot);
  const scripts = pkg?.scripts ?? {};

  progress(`Building production frontend (${kind}) in ${appRoot}…`);

  let buildCmd: { cmd: string; args: string[] };
  if (kind === "next") {
    buildCmd = scripts.build
      ? runner.run("build")
      : runner.exec("next", ["build"]);
  } else if (kind === "vite") {
    buildCmd = scripts.build
      ? runner.run("build")
      : runner.exec("vite", ["build"]);
  } else if (kind === "nuxt") {
    buildCmd = scripts.build
      ? runner.run("build")
      : runner.exec("nuxt", ["build"]);
  } else if (scripts.build) {
    buildCmd = runner.run("build");
  } else {
    return {
      ok: false,
      message: `No production build script found under ${appRoot}. Add a "build" script (or Next/Vite/Nuxt) and retry, or start the app yourself (e.g. http://localhost:3000).`,
    };
  }

  const built = await runOnce(
    buildCmd.cmd,
    buildCmd.args,
    appRoot,
    10 * 60 * 1000,
  );
  if (built.code !== 0) {
    const detail = (built.stderr || built.stdout).trim().slice(0, 400);
    return {
      ok: false,
      message: `Production build failed (exit ${built.code})${detail ? `: ${detail}` : "."}`,
    };
  }

  progress(`Starting production preview on ${url}…`);

  let start: { cmd: string; args: string[] };
  if (kind === "next") {
    start = scripts.start
      ? runner.run("start", ["-H", "127.0.0.1", "-p", String(port)])
      : runner.exec("next", ["start", "-H", "127.0.0.1", "-p", String(port)]);
  } else if (kind === "vite") {
    start = scripts.preview
      ? runner.run("preview", [
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--strictPort",
        ])
      : runner.exec("vite", [
          "preview",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--strictPort",
        ]);
  } else if (kind === "nuxt") {
    start = scripts.preview
      ? runner.run("preview", ["--host", "127.0.0.1", "--port", String(port)])
      : runner.exec("nuxt", [
          "preview",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
        ]);
  } else if (scripts.preview) {
    start = runner.run("preview");
  } else if (scripts.start) {
    start = runner.run("start");
  } else {
    return {
      ok: false,
      message: `Build succeeded but no start/preview script found under ${appRoot}.`,
    };
  }

  const child = spawn(start.cmd, start.args, {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
      CI: "1",
      FORCE_COLOR: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  let stderr = "";
  child.stderr?.on("data", (c: Buffer | string) => {
    stderr += String(c);
  });

  const ready = await waitForUrl(url, 90_000);
  if (!ready.ok) {
    await stopChild(child);
    return {
      ok: false,
      message: `Started ${kind} preview but ${url} never became ready. ${ready.message}${stderr ? ` · ${stderr.slice(0, 240)}` : ""}`,
    };
  }

  return {
    ok: true,
    handle: {
      url,
      port,
      kind,
      stop: async () => {
        await stopChild(child);
        // Kill process group when detached on Unix.
        if (process.platform !== "win32" && child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            /* ignore */
          }
        }
      },
    },
  };
}
