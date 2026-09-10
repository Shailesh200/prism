import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const PACKAGE_NAME = "@repo-prism/mcp-server";
const REGISTRY_URL = "https://registry.npmjs.org/@repo-prism/mcp-server/latest";
const PACK_MS = 45_000;

const execFileAsync = promisify(execFile);

export type NpmPack = (
  version: string,
  dest: string,
) => Promise<{ readonly ok: boolean; readonly detail: string }>;

export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split(".").map((part) => Number.parseInt(part, 10));
  const b = current.split(".").map((part) => Number.parseInt(part, 10));
  for (let i = 0; i < 3; i++) {
    const left = Number.isFinite(a[i]) ? a[i]! : 0;
    const right = Number.isFinite(b[i]) ? b[i]! : 0;
    if (left !== right) return left > right;
  }
  return false;
}

/**
 * A checkout of this repo must not hop to npm — that would replace the code
 * under development. Published npx/node_modules copies still hop.
 */
export function isLocalPrismInstall(entry = process.argv[1]): boolean {
  if (!entry) return false;
  const normalized = entry.replaceAll("\\", "/");
  if (normalized.includes("/node_modules/")) return false;
  return (
    normalized.includes("/packages/dispatch-hub/") ||
    normalized.includes("/packages/mcp-server/") ||
    normalized.endsWith("/src/bin.ts")
  );
}

export async function fetchLatestMcpVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export type McpUpdateStatus = {
  readonly current: string;
  readonly latest?: string;
  readonly stale: boolean;
  readonly localCheckout: boolean;
  readonly hop: "current" | "reload" | "local";
};

export async function mcpUpdateStatus(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
  localCheckout = isLocalPrismInstall(),
): Promise<McpUpdateStatus> {
  const latest = await fetchLatestMcpVersion(fetchImpl);
  if (!latest) {
    return {
      current: currentVersion,
      stale: false,
      localCheckout,
      hop: "current",
    };
  }
  const stale = isNewerVersion(latest, currentVersion);
  return {
    current: currentVersion,
    latest,
    stale,
    localCheckout,
    hop: stale ? (localCheckout ? "local" : "reload") : "current",
  };
}

export async function defaultNpmPack(
  version: string,
  dest: string,
): Promise<{ readonly ok: boolean; readonly detail: string }> {
  try {
    await execFileAsync(
      "npm",
      ["pack", `${PACKAGE_NAME}@${version}`, "--pack-destination", dest],
      { timeout: PACK_MS },
    );
    return { ok: true, detail: `Cached ${version}.` };
  } catch (cause) {
    const detail =
      cause instanceof Error
        ? (cause.message.split("\n")[0] ?? cause.message)
        : "npm pack failed.";
    return { ok: false, detail };
  }
}

export type ApplyMcpUpdateResult = {
  readonly ok: boolean;
  readonly current: string;
  readonly latest?: string;
  readonly cached: boolean;
  readonly localCheckout: boolean;
  readonly message: string;
};

export async function applyMcpUpdate(
  currentVersion: string,
  options: {
    readonly pack?: NpmPack;
    readonly fetchImpl?: typeof fetch;
    readonly localCheckout?: boolean;
  } = {},
): Promise<ApplyMcpUpdateResult> {
  const pack = options.pack ?? defaultNpmPack;
  const fetchImpl = options.fetchImpl ?? fetch;
  const localCheckout = options.localCheckout ?? isLocalPrismInstall();
  const latest = await fetchLatestMcpVersion(fetchImpl);
  if (!latest) {
    return {
      ok: false,
      current: currentVersion,
      cached: false,
      localCheckout,
      message: "Could not reach npm to see the latest Prism.",
    };
  }
  if (!isNewerVersion(latest, currentVersion)) {
    return {
      ok: true,
      current: currentVersion,
      latest,
      cached: false,
      localCheckout,
      message: `Already on ${currentVersion}.`,
    };
  }
  if (localCheckout) {
    return {
      ok: false,
      current: currentVersion,
      latest,
      cached: false,
      localCheckout,
      message: `Prism ${latest} is on npm. This Console is a local ${currentVersion} build — reload will not hop until you publish or run the npx install.`,
    };
  }

  const dir = await mkdtemp(join(tmpdir(), "prism-mcp-pack-"));
  try {
    const packed = await pack(latest, dir);
    if (!packed.ok) {
      return {
        ok: false,
        current: currentVersion,
        latest,
        cached: false,
        localCheckout,
        message: packed.detail,
      };
    }
    return {
      ok: true,
      current: currentVersion,
      latest,
      cached: true,
      localCheckout,
      message: `Cached Prism ${latest}. Reload Prism MCP in this chat to hop — a running session cannot swap mid-flight.`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
