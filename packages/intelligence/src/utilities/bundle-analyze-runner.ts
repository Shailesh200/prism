/**
 * Local bundle analyze runner — spawn project scripts or Prism-managed
 * analyze for Next / Vite / Webpack (M-050). Consent is enforced by the job layer.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type { BundleAnalyzeCapability, JsonValue } from "@prism/shared";
import {
  detectBundleAnalyzeCapability,
  discoverFreshBundleStatsFiles,
} from "./bundle-detect.js";
import { parseBuiltOutputAssets } from "./bundle-built-assets.js";
import {
  parseBundleStatsJson,
  type ParsedBundleStats,
} from "./bundle-parsers.js";

export const DEFAULT_BUNDLE_ANALYZE_TIMEOUT_MS = 10 * 60 * 1000;

export type BundleAnalyzeRunResult = {
  readonly parsed: ParsedBundleStats | null;
  readonly source: "analyze-script" | "prism-managed" | "discovered" | "ingest";
  readonly scriptName?: string;
  readonly packagePath: string;
  readonly packageName?: string;
  readonly bundler: BundleAnalyzeCapability["bundlers"][number] | "unknown";
  readonly statsPath?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly errorMessage?: string;
};

function makeRunResult(base: {
  parsed: ParsedBundleStats | null;
  source: BundleAnalyzeRunResult["source"];
  packagePath: string;
  bundler: BundleAnalyzeRunResult["bundler"];
  stdout: string;
  stderr: string;
  exitCode: number;
  packageName?: string;
  scriptName?: string;
  statsPath?: string;
  errorMessage?: string;
}): BundleAnalyzeRunResult {
  return {
    parsed: base.parsed,
    source: base.source,
    packagePath: base.packagePath,
    bundler: base.bundler,
    stdout: base.stdout,
    stderr: base.stderr,
    exitCode: base.exitCode,
    ...(base.packageName === undefined
      ? {}
      : { packageName: base.packageName }),
    ...(base.scriptName === undefined ? {} : { scriptName: base.scriptName }),
    ...(base.statsPath === undefined ? {} : { statsPath: base.statsPath }),
    ...(base.errorMessage === undefined
      ? {}
      : { errorMessage: base.errorMessage }),
  };
}

type PkgJson = {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
};

function readPkg(absDir: string): PkgJson | null {
  try {
    return JSON.parse(
      readFileSync(join(absDir, "package.json"), "utf8"),
    ) as PkgJson;
  } catch {
    return null;
  }
}

function pathExts(): string[] {
  return process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];
}

/** Extra dirs GUI/Electron hosts often omit from PATH. */
function packageManagerSearchDirs(): string[] {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  return [
    join(home, ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(home, ".local", "bin"),
    ...(process.env.PATH ?? "").split(delimiter),
  ];
}

/** Resolve bun/pnpm/yarn/npm to an absolute path when possible (fixes spawn ENOENT in Extension Host). */
export function resolvePackageManagerBin(name: string): string {
  for (const dir of packageManagerSearchDirs()) {
    if (!dir) continue;
    for (const ext of pathExts()) {
      const candidate = join(dir, `${name}${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  // Electron / GUI hosts often lack shell PATH — ask a login shell as last resort.
  if (process.platform === "darwin" || process.platform === "linux") {
    try {
      const shell = existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash";
      const flag = shell.endsWith("zsh") ? "-ilc" : "-lc";
      const probed = spawnSync(shell, [flag, `command -v ${name}`], {
        encoding: "utf8",
        timeout: 4000,
        env: process.env,
      });
      const line = (probed.stdout ?? "")
        .trim()
        .split("\n")
        .filter(Boolean)
        .at(-1);
      if (line && !line.includes(" ") && existsSync(line)) return line;
    } catch {
      /* ignore */
    }
  }
  return name;
}

function enrichPathEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const home = env.HOME ?? process.env.HOME ?? homedir();
  const prefix = [
    join(home, ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(home, ".local", "bin"),
  ].join(delimiter);
  const current = env.PATH ?? process.env.PATH ?? "";
  return { ...env, PATH: `${prefix}${delimiter}${current}` };
}

function detectRunner(
  root: string,
  workspaceRoot?: string,
): { cmd: string; runArgs: (script: string) => string[] } {
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
    return { cmd: resolvePackageManagerBin("bun"), runArgs: (s) => ["run", s] };
  }
  if (isPnpm) {
    return {
      cmd: resolvePackageManagerBin("pnpm"),
      runArgs: (s) => ["run", s],
    };
  }
  if (isYarn) {
    return {
      cmd: resolvePackageManagerBin("yarn"),
      runArgs: (s) => ["run", s],
    };
  }
  return {
    cmd: resolvePackageManagerBin("npm"),
    runArgs: (s) => ["run", s],
  };
}

function runCommand(
  cmd: string,
  args: readonly string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const env = enrichPathEnv(options.env ?? process.env);
    const resolvedCmd =
      cmd.includes("/") || cmd.includes("\\")
        ? cmd
        : resolvePackageManagerBin(cmd);
    const child = spawn(resolvedCmd, [...args], {
      cwd: options.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            child.kill("SIGTERM");
          }, options.timeoutMs)
        : null;
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      stderr += text;
      options.onStderr?.(text);
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      const hint =
        err && typeof err === "object" && "code" in err && err.code === "ENOENT"
          ? ` (could not find \`${resolvedCmd}\` — ensure bun/pnpm/npm/yarn is installed under ~/.bun/bin or Homebrew)`
          : "";
      resolve({
        code: -1,
        stdout,
        stderr: `${err.message || String(err)}${hint}`,
      });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function tryParseFile(absPath: string): ParsedBundleStats | null {
  try {
    const raw = JSON.parse(readFileSync(absPath, "utf8")) as unknown;
    return parseBundleStatsJson(raw);
  } catch {
    return null;
  }
}

/** Prefer exit/error lines over noisy Rollup "Use of eval" warnings. */
function summarizeBuildLog(stderr: string, stdout: string): string {
  const text = `${stderr}\n${stdout}`;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const preferred = lines.filter(
    (l) =>
      /error|failed|ERR!|ENOENT|ELIFECYCLE/i.test(l) && !/use of eval/i.test(l),
  );
  const pick = (preferred.length > 0 ? preferred : lines)
    .slice(-6)
    .join(" · ")
    .slice(0, 420);
  return pick || "See build output for details.";
}

function resolvePackageAbs(workspaceRoot: string, packagePath: string): string {
  if (packagePath === "." || packagePath === "") return workspaceRoot;
  return join(workspaceRoot, packagePath);
}

/**
 * Prism-managed: write webpack/vite stats to `.prism/bundle-analyze/stats.json`
 * via env-driven one-shot when the project has a build script.
 * For Next with @next/bundle-analyzer we still prefer project scripts.
 */
async function runPrismManagedAnalyze(options: {
  readonly workspaceRoot: string;
  readonly packageAbs: string;
  readonly bundler: "next" | "vite" | "webpack";
  readonly timeoutMs: number;
  readonly onProgress?: (message: string) => void;
}): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  statsPath?: string;
  parsed?: ParsedBundleStats;
}> {
  const outDir = join(options.packageAbs, ".prism", "bundle-analyze");
  mkdirSync(outDir, { recursive: true });
  const statsPath = join(outDir, "stats.json");
  const runner = detectRunner(options.packageAbs, options.workspaceRoot);
  const pkg = readPkg(options.packageAbs);
  const scripts = pkg?.scripts ?? {};

  // Prefer an existing build that can emit stats via env, else plain build + discover.
  let script = "build";
  if (typeof scripts["analyze"] === "string") script = "analyze";
  else if (typeof scripts["build:analyze"] === "string")
    script = "build:analyze";
  else if (typeof scripts.build !== "string") {
    return {
      code: 1,
      stdout: "",
      stderr: "No build/analyze script found for Prism-managed analyze.",
    };
  }

  options.onProgress?.(
    `Prism-managed ${options.bundler} analyze via \`${script}\`…`,
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ANALYZE: "true",
    BUNDLE_ANALYZE: "true",
    PRISM_BUNDLE_STATS_PATH: statsPath,
    // webpack-bundle-analyzer / next often honor these:
    WEBPACK_BUNDLE_ANALYZER_MODE: "json",
    WEBPACK_BUNDLE_ANALYZER_STATS_OPTIONS: "true",
  };

  // For Vite without visualizer, generate a minimal esbuild-ish hint is not allowed —
  // we only run the script and discover output.
  const result = await runCommand(runner.cmd, runner.runArgs(script), {
    cwd: options.packageAbs,
    env,
    timeoutMs: options.timeoutMs,
    onStdout: (c) => options.onProgress?.(c.trim()),
    onStderr: (c) => options.onProgress?.(c.trim()),
  });

  // If the tool wrote to our path, great; else discover.
  if (existsSync(statsPath)) {
    const parsed = tryParseFile(statsPath);
    if (parsed) {
      return { ...result, statsPath, parsed };
    }
  }

  // Vite + rollup-plugin-visualizer often writes dist/stats.json when configured.
  // Emit a tiny helper note file so discover can find fresh outputs.
  writeFileSync(
    join(outDir, "last-run.json"),
    JSON.stringify({
      at: new Date().toISOString(),
      bundler: options.bundler,
      script,
      exitCode: result.code,
    }),
    "utf8",
  );

  const fresh = discoverFreshBundleStatsFiles(options.packageAbs);
  for (const path of fresh) {
    const parsed = tryParseFile(path);
    if (parsed) {
      return { ...result, statsPath: path, parsed };
    }
  }

  // After a successful build: use on-disk production assets (dist / .next) when
  // no analyzer JSON was emitted (common for Vite without visualizer).
  if (result.code === 0) {
    const fromDisk = parseBuiltOutputAssets(
      options.packageAbs,
      options.bundler,
    );
    if (fromDisk && fromDisk.chunks.length > 0) {
      return {
        ...result,
        parsed: fromDisk,
        statsPath: join(outDir, "built-assets.note"),
      };
    }
  }

  return result;
}

export async function runBundleAnalyze(options: {
  readonly workspaceRoot: string;
  readonly packageId?: string;
  readonly packagePath?: string;
  readonly scriptName?: string;
  readonly mode?: "run" | "ingest" | "discover";
  readonly reportPath?: string;
  readonly timeoutMs?: number;
  readonly onProgress?: (message: string) => void;
}): Promise<BundleAnalyzeRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BUNDLE_ANALYZE_TIMEOUT_MS;
  const capability = detectBundleAnalyzeCapability(
    options.workspaceRoot,
    options.packageId === undefined
      ? undefined
      : { packageId: options.packageId },
  );

  const pick =
    (options.packageId
      ? capability.packages.find((p) => p.packageId === options.packageId)
      : undefined) ??
    capability.packages.find((p) => p.hasAnalyzeScript) ??
    capability.packages.find(
      (p) =>
        p.bundler === "next" || p.bundler === "vite" || p.bundler === "webpack",
    ) ??
    capability.packages[0];

  const packagePath = options.packagePath ?? pick?.packagePath ?? ".";
  const packageAbs = resolvePackageAbs(options.workspaceRoot, packagePath);
  const packageName = pick?.packageName;
  const bundler = pick?.bundler ?? "unknown";

  if (options.mode === "ingest") {
    if (!options.reportPath) {
      return makeRunResult({
        parsed: null,
        source: "ingest",
        packagePath,
        ...(packageName === undefined ? {} : { packageName }),
        bundler,
        stdout: "",
        stderr: "",
        exitCode: 1,
        errorMessage: "bundleAnalyze.reportPath required for mode=ingest",
      });
    }
    const abs = options.reportPath.startsWith("/")
      ? options.reportPath
      : join(options.workspaceRoot, options.reportPath);
    const parsed = tryParseFile(abs);
    return makeRunResult({
      parsed,
      source: "ingest",
      packagePath,
      ...(packageName === undefined ? {} : { packageName }),
      bundler: parsed?.bundler ?? bundler,
      statsPath: abs,
      stdout: "",
      stderr: "",
      exitCode: parsed ? 0 : 1,
      ...(parsed
        ? {}
        : {
            errorMessage: `Could not parse bundle stats at ${abs}`,
          }),
    });
  }

  if (options.mode === "discover") {
    const fresh = discoverFreshBundleStatsFiles(packageAbs);
    for (const path of fresh) {
      const parsed = tryParseFile(path);
      if (parsed) {
        return makeRunResult({
          parsed,
          source: "discovered",
          packagePath,
          ...(packageName === undefined ? {} : { packageName }),
          bundler: parsed.bundler,
          statsPath: path,
          stdout: "",
          stderr: "",
          exitCode: 0,
        });
      }
    }
    return makeRunResult({
      parsed: null,
      source: "discovered",
      packagePath,
      ...(packageName === undefined ? {} : { packageName }),
      bundler,
      stdout: "",
      stderr: "",
      exitCode: 1,
      errorMessage: "No fresh local analyze JSON found under the package.",
    });
  }

  // mode=run (default)
  const scriptInfo =
    (options.scriptName
      ? capability.scripts.find(
          (s) =>
            s.scriptName === options.scriptName &&
            (options.packageId === undefined ||
              s.packageId === options.packageId),
        )
      : undefined) ??
    capability.scripts.find(
      (s) =>
        s.packagePath === packagePath ||
        (options.packageId !== undefined && s.packageId === options.packageId),
    ) ??
    capability.scripts[0];

  if (scriptInfo) {
    options.onProgress?.(
      `Running project script \`${scriptInfo.scriptName}\`…`,
    );
    const runner = detectRunner(packageAbs, options.workspaceRoot);
    const result = await runCommand(
      runner.cmd,
      runner.runArgs(scriptInfo.scriptName),
      {
        cwd: packageAbs,
        env: {
          ...process.env,
          ANALYZE: "true",
          BUNDLE_ANALYZE: "true",
        },
        timeoutMs,
        onStdout: (c) => {
          const line = c.trim();
          if (line) options.onProgress?.(line);
        },
        onStderr: (c) => {
          const line = c.trim();
          if (line) options.onProgress?.(line);
        },
      },
    );

    const fresh = discoverFreshBundleStatsFiles(packageAbs);
    for (const path of fresh) {
      const parsed = tryParseFile(path);
      if (parsed) {
        return makeRunResult({
          parsed,
          source: "analyze-script",
          scriptName: scriptInfo.scriptName,
          packagePath,
          ...(packageName === undefined ? {} : { packageName }),
          bundler: parsed.bundler === "unknown" ? bundler : parsed.bundler,
          statsPath: path,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.code,
        });
      }
    }

    const fromDisk = parseBuiltOutputAssets(
      packageAbs,
      bundler === "unknown" ? "vite" : bundler,
    );
    if (fromDisk) {
      return makeRunResult({
        parsed: fromDisk,
        source: "analyze-script",
        scriptName: scriptInfo.scriptName,
        packagePath,
        ...(packageName === undefined ? {} : { packageName }),
        bundler: fromDisk.bundler === "unknown" ? bundler : fromDisk.bundler,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
      });
    }

    return makeRunResult({
      parsed: null,
      source: "analyze-script",
      scriptName: scriptInfo.scriptName,
      packagePath,
      ...(packageName === undefined ? {} : { packageName }),
      bundler,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code === 0 ? 1 : result.code,
      errorMessage:
        result.code !== 0
          ? `Analyze script exited ${result.code}: ${summarizeBuildLog(result.stderr, result.stdout)}`
          : "Analyze script finished but no parsable stats JSON or dist/.next assets were found.",
    });
  }

  // Prism-managed for supported bundlers.
  if (bundler === "next" || bundler === "vite" || bundler === "webpack") {
    const managed = await runPrismManagedAnalyze({
      workspaceRoot: options.workspaceRoot,
      packageAbs,
      bundler,
      timeoutMs,
      ...(options.onProgress === undefined
        ? {}
        : { onProgress: options.onProgress }),
    });
    const parsed =
      managed.parsed ??
      (managed.statsPath ? tryParseFile(managed.statsPath) : null);
    if (parsed) {
      return makeRunResult({
        parsed,
        source: "prism-managed",
        packagePath,
        ...(packageName === undefined ? {} : { packageName }),
        bundler: parsed.bundler === "unknown" ? bundler : parsed.bundler,
        ...(managed.statsPath === undefined
          ? {}
          : { statsPath: managed.statsPath }),
        stdout: managed.stdout,
        stderr: managed.stderr,
        exitCode: managed.code,
      });
    }
    const tip =
      managed.code === 0
        ? "Build finished but no production assets or analyzer JSON were found under dist/ or .next/. Ensure the package build writes client output."
        : `Build exited ${managed.code}. ${summarizeBuildLog(managed.stderr, managed.stdout)}`;
    return makeRunResult({
      parsed: null,
      source: "prism-managed",
      packagePath,
      ...(packageName === undefined ? {} : { packageName }),
      bundler,
      stdout: managed.stdout,
      stderr: managed.stderr,
      exitCode: managed.code === 0 ? 1 : managed.code,
      errorMessage: tip,
    });
  }

  return makeRunResult({
    parsed: null,
    source: "prism-managed",
    packagePath,
    ...(packageName === undefined ? {} : { packageName }),
    bundler,
    stdout: "",
    stderr: "",
    exitCode: 1,
    errorMessage:
      capability.reason ??
      "Unsupported stack for Prism-managed analyze. Add an analyze script that emits webpack/rollup/esbuild stats JSON.",
  });
}

/** Progress detail for UI (optional). */
export function bundleAnalyzeProgressDetail(options: {
  readonly phase: string;
  readonly packagePath?: string;
  readonly message?: string;
}): JsonValue {
  return {
    kind: "bundle-analyze-progress",
    phase: options.phase,
    ...(options.packagePath === undefined
      ? {}
      : { packagePath: options.packagePath }),
    ...(options.message === undefined ? {} : { message: options.message }),
  };
}
