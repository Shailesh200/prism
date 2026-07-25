/**
 * Discover a reachable local frontend URL, or start a short-lived production
 * preview (build + serve) for Lighthouse mode=run.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { probeLabUrl } from "./lighthouse-runner.js";

/** Ports commonly used by Next / Vite / CRA / Nuxt / static servers.
 * Note: :5000 is omitted — on macOS it is usually AirPlay Receiver (AirTunes),
 * which accepts TCP but is not a frontend (see probeLabUrl). */
export const COMMON_LAB_PORTS: readonly number[] = [
  3000, 3001, 5173, 4173, 8080, 4200, 4321, 8000,
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
    "apps/playground",
    "web",
    "frontend",
    "app",
    "playground",
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

function detectRunner(
  root: string,
  workspaceRoot?: string,
): {
  run: (
    script: string,
    extraArgs?: readonly string[],
  ) => { cmd: string; args: string[] };
  exec: (
    bin: string,
    args: readonly string[],
  ) => { cmd: string; args: string[] };
} {
  const lockRoots = workspaceRoot ? [root, workspaceRoot] : [root];
  const isBun = lockRoots.some(
    (dir) =>
      existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb")),
  );
  const isPnpm = lockRoots.some((dir) =>
    existsSync(join(dir, "pnpm-lock.yaml")),
  );
  const isYarn = lockRoots.some(
    (dir) =>
      existsSync(join(dir, "yarn.lock")) ||
      existsSync(join(dir, ".yarnrc.yml")),
  );

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
      args:
        extra.length > 0 ? ["run", script, "--", ...extra] : ["run", script],
    }),
    exec: (bin, args) => ({ cmd: "npx", args: ["--yes", bin, ...args] }),
  };
}

/**
 * Resolve how to start a production preview after build.
 *
 * Next.js: never append `-H/-p` via `pnpm/npm run start -- …` — compound
 * scripts like `ensure-db && next start` treat `-H` as a project directory.
 * Use the start script + PORT/HOSTNAME env instead.
 *
 * Vite / Nuxt: must pass `--host 127.0.0.1 --port …` (they do not honor PORT
 * the way Next does). On macOS, default `localhost` can bind only to `::1`,
 * so probes to `127.0.0.1` stay ECONNREFUSED until we SIGTERM the process
 * (exit 143). Prefer package `preview` + extras when the script is simple;
 * fall back to `exec` for compound scripts.
 */
export function resolveLabPreviewStart(
  kind: LabKind,
  scripts: { readonly start?: string; readonly preview?: string },
  port: number,
  runner: {
    run: (
      script: string,
      extraArgs?: readonly string[],
    ) => { cmd: string; args: string[] };
    exec: (
      bin: string,
      args: readonly string[],
    ) => { cmd: string; args: string[] };
  },
): { cmd: string; args: string[] } | { error: string } {
  const compound = (script: string | undefined): boolean =>
    Boolean(script && /&&|\|\||;|\n/.test(script));

  if (kind === "next") {
    if (scripts.start) return runner.run("start");
    return runner.exec("next", [
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ]);
  }
  if (kind === "vite") {
    const extras = [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ] as const;
    if (scripts.preview && !compound(scripts.preview)) {
      return runner.run("preview", extras);
    }
    return runner.exec("vite", ["preview", ...extras]);
  }
  if (kind === "nuxt") {
    const extras = ["--host", "127.0.0.1", "--port", String(port)] as const;
    if (scripts.preview && !compound(scripts.preview)) {
      return runner.run("preview", extras);
    }
    return runner.exec("nuxt", ["preview", ...extras]);
  }
  if (scripts.preview) return runner.run("preview");
  if (scripts.start) return runner.run("start");
  return {
    error: "Build succeeded but no start/preview script found.",
  };
}

function emitLogLines(
  chunk: string,
  onProgress: (message: string) => void,
): void {
  for (const line of chunk.split(/\r?\n/)) {
    const t = line.trim();
    if (t) onProgress(t);
  }
}

function runOnce(
  cmd: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  onProgress?: (message: string) => void,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const progress = onProgress ?? (() => undefined);
    progress(`$ ${cmd} ${args.join(" ")}`);
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
      const text = String(c);
      stdout += text;
      emitLogLines(text, progress);
    });
    child.stderr?.on("data", (c: Buffer | string) => {
      const text = String(c);
      stderr += text;
      emitLogLines(text, progress);
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
  const runner = detectRunner(appRoot, options.workspaceRoot);
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
    progress,
  );
  if (built.code !== 0) {
    const detail = (built.stderr || built.stdout).trim().slice(0, 400);
    return {
      ok: false,
      message: `Production build failed (exit ${built.code})${detail ? `: ${detail}` : "."}`,
    };
  }

  progress(`Starting production preview on ${url}…`);

  const start = resolveLabPreviewStart(kind, scripts, port, runner);
  if ("error" in start) {
    return {
      ok: false,
      message: `${start.error} under ${appRoot}.`,
    };
  }

  progress(`$ ${start.cmd} ${start.args.join(" ")}`);
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
  child.stdout?.on("data", (c: Buffer | string) => {
    emitLogLines(String(c), progress);
  });
  child.stderr?.on("data", (c: Buffer | string) => {
    const text = String(c);
    stderr += text;
    emitLogLines(text, progress);
  });

  const ready = await waitForUrl(url, 90_000);
  if (!ready.ok) {
    await stopChild(child);
    return {
      ok: false,
      message: `Started ${kind} preview but ${url} never became ready. ${ready.message}${stderr ? ` · ${stderr.slice(0, 240)}` : ""}`,
    };
  }

  progress(`Production preview ready at ${url}`);
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
