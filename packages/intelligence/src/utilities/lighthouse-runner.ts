/**
 * Opt-in local Lighthouse runner (M-046 r6).
 *
 * Prefers system Chrome/Chromium/Edge; installs the Lighthouse CLI only under
 * workspace `.prism/tools/lighthouse`. Never fabricates lab-fixture scores.
 */

import { spawn } from "node:child_process";
import {
  access,
  constants,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { createConsentStore } from "./consent.js";

export type ResolveChromeResult =
  | { readonly ok: true; readonly path: string; readonly source: string }
  | { readonly ok: false; readonly message: string };

export type EnsureLighthouseResult =
  | { readonly ok: true; readonly bin: string }
  | { readonly ok: false; readonly message: string };

export type RunLighthouseCliResult =
  | { readonly ok: true; readonly lhr: unknown; readonly reportPath: string }
  | { readonly ok: false; readonly message: string };

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function pathExts(): readonly string[] {
  if (process.platform !== "win32") return [""];
  return (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean);
}

/** Build ordered Chrome binary candidates for this platform. */
export function chromeCandidates(): readonly {
  path: string;
  source: string;
}[] {
  const out: { path: string; source: string }[] = [];
  const env = process.env.CHROME_PATH?.trim();
  if (env) out.push({ path: env, source: "CHROME_PATH" });

  const pathBins = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "chrome",
    "msedge",
    "microsoft-edge",
  ];
  const pathEnv = process.env.PATH ?? "";
  for (const bin of pathBins) {
    for (const dir of pathEnv.split(delimiter)) {
      if (!dir) continue;
      for (const ext of pathExts()) {
        out.push({
          path: join(dir, `${bin}${ext}`),
          source: `PATH:${bin}`,
        });
      }
    }
  }

  if (process.platform === "darwin") {
    for (const path of [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      join(
        homedir(),
        "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ),
    ]) {
      out.push({ path, source: "macOS Applications" });
    }
  } else if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? "";
    const pf = process.env.PROGRAMFILES ?? "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    for (const path of [
      join(local, "Google", "Chrome", "Application", "chrome.exe"),
      join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]) {
      out.push({ path, source: "Windows install" });
    }
  } else {
    for (const path of [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    ]) {
      out.push({ path, source: "Linux system path" });
    }
  }

  return out;
}

/**
 * Resolve a system Chrome / Chromium / Edge binary.
 * Tries `chrome-launcher` when available, then env / PATH / known install paths.
 */
export async function resolveSystemChrome(): Promise<ResolveChromeResult> {
  // Test harness: force a miss without depending on the host having Chrome.
  if (process.env.PRISM_TEST_NO_CHROME === "1") {
    return {
      ok: false,
      message:
        "No system Chrome/Chromium/Edge found. Install Chrome (or set CHROME_PATH), serve your app locally, then retry. Lab-fixture scores are never shown for mode=run.",
    };
  }

  // Prefer chrome-launcher when present (often next to a Lighthouse install).
  try {
    const { createRequire } = await import("node:module");
    type ChromeLauncher = { getChromePath?: () => string };
    // Prefer workspace / .prism tool installs — do not use import.meta.url
    // (bundlers rewrite it to an absolute build-machine path).
    const candidates = [
      join(process.cwd(), "package.json"),
      join(process.cwd(), ".prism", "tools", "lighthouse", "package.json"),
    ];
    let chromePath: string | undefined;
    for (const from of candidates) {
      try {
        const require = createRequire(from);
        const mod = require("chrome-launcher") as ChromeLauncher;
        const path = mod.getChromePath?.();
        if (typeof path === "string" && path.length > 0) {
          chromePath = path;
          break;
        }
      } catch {
        /* not installed here */
      }
    }
    if (chromePath && (await pathExists(chromePath))) {
      return { ok: true, path: chromePath, source: "chrome-launcher" };
    }
  } catch {
    /* chrome-launcher not installed — fall through */
  }

  const seen = new Set<string>();
  for (const c of chromeCandidates()) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    if (await pathExists(c.path)) {
      return { ok: true, path: c.path, source: c.source };
    }
  }

  return {
    ok: false,
    message:
      "No system Chrome/Chromium/Edge found. Install Chrome (or set CHROME_PATH), serve your app locally, then retry. Lab-fixture scores are never shown for mode=run.",
  };
}

function run(
  cmd: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
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
      resolve({
        code: -1,
        stdout,
        stderr: err.message || String(err),
      });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function findOnPath(name: string): Promise<string | null> {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of pathExts()) {
      const candidate = join(dir, `${name}${ext}`);
      if (await pathExists(candidate)) return candidate;
    }
  }
  return null;
}

async function findInstallCmd(): Promise<{
  cmd: string;
  args: string[];
} | null> {
  const bun = await findOnPath("bun");
  if (bun) {
    return { cmd: bun, args: ["add", "lighthouse@12"] };
  }
  const npm = await findOnPath("npm");
  if (npm) {
    return {
      cmd: npm,
      args: ["install", "lighthouse@12", "--no-fund", "--no-audit"],
    };
  }
  return null;
}

function lighthouseBin(prefix: string): string {
  const base = join(prefix, "node_modules", ".bin");
  return process.platform === "win32"
    ? join(base, "lighthouse.cmd")
    : join(base, "lighthouse");
}

function toolsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".prism", "tools", "lighthouse");
}

/**
 * Ensure Lighthouse CLI is installed under `.prism/tools/lighthouse` (once).
 *
 * The install pulls a package tree from the npm registry, so it is gated on
 * `network.package-install` separately from consenting to *run* Lighthouse
 * (M-036 F5). An already-installed binary needs no gate: nothing leaves the
 * machine to use it.
 */
export async function ensureLighthouseCli(
  workspaceRoot: string,
): Promise<EnsureLighthouseResult> {
  const prefix = toolsRoot(workspaceRoot);
  await mkdir(prefix, { recursive: true });

  const bin = lighthouseBin(prefix);
  if (await pathExists(bin)) {
    return { ok: true, bin };
  }

  const gate = await createConsentStore({ workspaceRoot }).requireGranted(
    "network.package-install",
  );
  if (!gate.ok) {
    return { ok: false, message: gate.error.message };
  }

  const pkgPath = join(prefix, "package.json");
  if (!(await pathExists(pkgPath))) {
    await writeFile(
      pkgPath,
      JSON.stringify(
        {
          name: "prism-lighthouse-tools",
          private: true,
          version: "0.0.0",
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  const installer = await findInstallCmd();
  if (!installer) {
    return {
      ok: false,
      message:
        "Cannot install Lighthouse CLI: neither bun nor npm found on PATH. Install Node/npm (or Bun), allow network integrations, then retry.",
    };
  }

  const result = await run(installer.cmd, installer.args, {
    cwd: prefix,
    timeoutMs: 5 * 60 * 1000,
    env: { ...process.env, npm_config_fund: "false" },
  });

  if (result.code !== 0 || !(await pathExists(bin))) {
    const detail = (result.stderr || result.stdout).trim().slice(0, 400);
    return {
      ok: false,
      message: `Failed to install Lighthouse CLI under .prism/tools/lighthouse${detail ? `: ${detail}` : "."} Allow network integrations and retry. Lab-fixture scores are never shown for mode=run.`,
    };
  }

  return { ok: true, bin };
}

/** True when a listener is a known non-app service (e.g. macOS AirPlay on :5000). */
export function isNonAppLabServer(serverHeader: string): boolean {
  return /AirTunes|AirPlay|ControlCenter|ControlCe/i.test(serverHeader);
}

/**
 * Soft-404 / empty-route heuristics for SPAs that return HTTP 200 with a
 * “Page not found” document (common with client routers).
 */
export function looksLikeNotFoundHtml(html: string): boolean {
  const sample = html.slice(0, 24_000);
  if (
    /<title[^>]*>[^<]*(404|not\s*found|page not found)[^<]*<\/title>/i.test(
      sample,
    )
  ) {
    return true;
  }
  if (
    /page not found|this page could not be found|404 not found|we can'?t find (that|this) page/i.test(
      sample,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * After Lighthouse, detect soft-404 pages (SPA 200 + Not Found content).
 */
export function lighthouseLooksLikeNotFound(lhr: unknown): boolean {
  const root =
    lhr && typeof lhr === "object" && !Array.isArray(lhr)
      ? (lhr as Record<string, unknown>)
      : null;
  const audits =
    root?.audits &&
    typeof root.audits === "object" &&
    !Array.isArray(root.audits)
      ? (root.audits as Record<string, unknown>)
      : null;
  if (!audits) return false;

  const title = audits["document-title"];
  const titleRec =
    title && typeof title === "object" && !Array.isArray(title)
      ? (title as Record<string, unknown>)
      : null;
  const titleText = String(
    titleRec?.displayValue ?? titleRec?.description ?? "",
  );
  if (/404|not\s*found|page not found/i.test(titleText)) return true;

  const scanLabels = (auditId: string): boolean => {
    const audit = audits[auditId];
    const labels: string[] = [];
    const collect = (value: unknown, depth = 0): void => {
      if (depth > 6 || labels.length >= 6) return;
      if (Array.isArray(value)) {
        for (const item of value) collect(item, depth + 1);
        return;
      }
      if (!value || typeof value !== "object") return;
      const rec = value as Record<string, unknown>;
      for (const key of ["nodeLabel", "snippet", "selector"] as const) {
        const v = rec[key];
        if (typeof v === "string" && v.trim()) labels.push(v.trim());
      }
      for (const child of Object.values(rec)) {
        if (typeof child === "object" && child !== null)
          collect(child, depth + 1);
      }
    };
    if (audit && typeof audit === "object") {
      collect((audit as Record<string, unknown>).details);
    }
    return labels.some((l) => /page not found|404 not found|\b404\b/i.test(l));
  };

  return (
    scanLabels("largest-contentful-paint-element") ||
    scanLabels("layout-shift-elements") ||
    scanLabels("layout-shifts")
  );
}

/**
 * HTTP(S) probe so we fail fast with a clear message instead of Chrome's
 * interstitial (unreachable ports / chrome-error:// pages / AirPlay on :5000).
 *
 * Only treats 2xx/3xx responses from real web servers as reachable. A bare TCP
 * accept (e.g. macOS AirTunes 403) must not count as a frontend.
 */
export async function probeLabUrl(
  url: string,
): Promise<{ ok: true; status: number } | { ok: false; message: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: `Invalid lab URL: ${url}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      message: `Lab URL must be http(s): ${url}`,
    };
  }
  const lib = parsed.protocol === "https:" ? httpsRequest : httpRequest;
  return await new Promise((resolve) => {
    const req = lib(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        timeout: 2500,
        rejectUnauthorized: false,
        headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const server = String(res.headers.server ?? "");
        const contentType = String(res.headers["content-type"] ?? "");
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          if (total >= 24_000) return;
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const room = 24_000 - total;
          chunks.push(room < buf.length ? buf.subarray(0, room) : buf);
          total += Math.min(room, buf.length);
        });
        res.on("end", () => {
          if (isNonAppLabServer(server)) {
            resolve({
              ok: false,
              message: `${url} is not a frontend (Server: ${server || "unknown"}). macOS AirPlay often occupies :5000 — start your app on another port or let Prism start a production preview.`,
            });
            return;
          }

          if (status < 200 || status >= 400) {
            resolve({
              ok: false,
              message: `${url} returned HTTP ${status}${server ? ` (Server: ${server})` : ""}. Start the app (or retry for a production preview) — Chrome’s interstitial usually means this URL is not serving your HTML.`,
            });
            return;
          }

          if (
            contentType &&
            /application\/json|application\/octet-stream|text\/event-stream/i.test(
              contentType,
            )
          ) {
            resolve({
              ok: false,
              message: `${url} returned ${contentType}, not an HTML document. Point Lighthouse at the frontend origin (e.g. http://localhost:3000).`,
            });
            return;
          }

          const body = Buffer.concat(chunks).toString("utf8");
          if (body && looksLikeNotFoundHtml(body)) {
            resolve({
              ok: false,
              message: `${url} looks like a not-found page — skipped for lab measurement.`,
            });
            return;
          }

          resolve({ ok: true, status });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({
        ok: false,
        message: `Timed out reaching ${url}. Start your frontend (e.g. http://localhost:3000) and retry — or leave it stopped and Prism will try a production preview.`,
      });
    });
    req.on("error", (err: Error) => {
      resolve({
        ok: false,
        message: `Nothing is listening at ${url} (${err.message}). Start the app (common ports: 3000, 5173, …) or retry so Prism can start a production preview. Chrome’s interstitial usually means the URL was unreachable.`,
      });
    });
    req.end();
  });
}

/**
 * Pick the first reachable lab URL among the configured URL and common
 * localhost ports (3000, 5173, 4173, …).
 */
export async function resolveReachableLabUrl(options: {
  readonly url?: string;
  readonly port?: number;
}): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const { discoverLabUrl } = await import("./lab-server.js");
  const found = await discoverLabUrl(options);
  if (!found.ok) return found;
  return { ok: true, url: found.url };
}

/**
 * Spawn Lighthouse CLI against `url`, write raw LHR JSON under `.prism/ingest`,
 * and return the parsed report.
 *
 * Uses the given URL only (no re-discovery across common ports) so a bad
 * listener like macOS AirPlay on :5000 cannot replace a chosen lab target.
 */
export async function runLighthouseCli(options: {
  readonly workspaceRoot: string;
  readonly url: string;
  readonly chromePath: string;
  readonly bin: string;
  readonly onLog?: (line: string) => void;
}): Promise<RunLighthouseCliResult> {
  const log = options.onLog ?? (() => undefined);
  const url = options.url.trim();
  const probe = await probeLabUrl(url);
  if (!probe.ok) {
    return { ok: false, message: probe.message };
  }

  const ingestDir = join(options.workspaceRoot, ".prism", "ingest");
  await mkdir(ingestDir, { recursive: true });
  const stamp = Date.now().toString(36);
  const reportPath = join(ingestDir, `lighthouse-raw-${stamp}.json`);

  // Keep flags space-separated and comma-free — Lighthouse’s chrome-flags
  // splitter treats commas as separators, which breaks --disable-features=a,b.
  const chromeFlags = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--ignore-certificate-errors",
    "--allow-insecure-localhost",
    "--disable-dev-shm-usage",
  ].join(" ");

  const args = [
    url,
    "--output=json",
    `--output-path=${reportPath}`,
    `--chrome-path=${options.chromePath}`,
    `--chrome-flags=${chromeFlags}`,
    "--only-categories=performance,accessibility,best-practices,seo",
    // Pin mobile + simulated throttling so every pass uses the same model
    // (reduces “laptop vs phone” confusion; multi-pass median handles noise).
    "--form-factor=mobile",
    "--screenEmulation.mobile=true",
    "--throttling-method=simulate",
  ];

  log(`Lighthouse CLI → ${url}`);
  log(`Chrome: ${options.chromePath}`);
  log(`Report: ${reportPath}`);

  // Prefer invoking the JS entry with node/bun so shebang/.cmd quirks don't fail.
  const node = (await findOnPath("node")) ?? "node";
  const bunBin = await findOnPath("bun");
  const cliJs = join(
    toolsRoot(options.workspaceRoot),
    "node_modules",
    "lighthouse",
    "cli",
    "index.js",
  );

  const forwardLogs = {
    onStdout: (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        const t = line.trim();
        if (t) log(t);
      }
    },
    onStderr: (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        const t = line.trim();
        if (t) log(t);
      }
    },
  };

  let result: { code: number; stdout: string; stderr: string };
  if (await pathExists(cliJs)) {
    const runner = bunBin ?? node;
    log(`$ ${runner} ${cliJs} ${args.join(" ")}`);
    result = await run(runner, [cliJs, ...args], {
      cwd: options.workspaceRoot,
      timeoutMs: 4 * 60 * 1000,
      env: {
        ...process.env,
        CHROME_PATH: options.chromePath,
        PUPPETEER_SKIP_DOWNLOAD: "1",
      },
      ...forwardLogs,
    });
  } else {
    log(`$ ${options.bin} ${args.join(" ")}`);
    result = await run(options.bin, args, {
      cwd: options.workspaceRoot,
      timeoutMs: 4 * 60 * 1000,
      env: {
        ...process.env,
        CHROME_PATH: options.chromePath,
        PUPPETEER_SKIP_DOWNLOAD: "1",
      },
      ...forwardLogs,
    });
  }

  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim().slice(0, 500);
    const interstitial =
      /interstitial|ERR_CERT|NET::ERR|chrome prevented page load/i.test(detail);
    const hint = interstitial
      ? ` Chrome blocked ${url} (cert interstitial or error page). Confirm the app serves HTML at that URL (not a redirect to a login/HTTPS interstitial), or import a Lighthouse JSON instead.`
      : " Ensure the app is reachable at the lab URL/port.";
    return {
      ok: false,
      message: `Lighthouse CLI failed (exit ${result.code})${detail ? `: ${detail}` : "."}${hint}`,
    };
  }

  try {
    const text = await readFile(reportPath, "utf8");
    const lhr = JSON.parse(text) as unknown;
    log(`Lighthouse finished → ${reportPath}`);
    return { ok: true, lhr, reportPath };
  } catch (cause) {
    return {
      ok: false,
      message: `Lighthouse finished but the JSON report could not be read: ${String(cause)}`,
    };
  }
}
