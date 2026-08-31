/**
 * On MCP process start, run the newest published @repo-prism/mcp-server when
 * this tree is stale. Cursor caches `npx @latest` by specifier, so a new
 * publish otherwise keeps serving the old server until someone edits mcp.json.
 *
 * This is a launch-time hop, not a hot reload: the host must start a new
 * process (Cursor restart or one MCP toggle). After 1.1.7 is running once,
 * later publishes pick up on the next start with no config change.
 *
 * Fail-open: a timeout or registry error leaves the current binary in place.
 * Workers never self-update (PRISM_DISPATCH_ROLE=worker).
 */

import { spawn, type ChildProcess } from "node:child_process";

const PACKAGE_NAME = "@repo-prism/mcp-server";

const REGISTRY_URL = "https://registry.npmjs.org/@repo-prism/mcp-server/latest";
const FETCH_MS = 2000;

export type AutoUpdateResult = "current" | "reexec" | "skipped";

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

export async function fetchLatestMcpVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
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

export type ReexecLatestInput = {
  readonly currentVersion: string;
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly spawnImpl?: typeof spawn;
  readonly write?: (line: string) => void;
};

/**
 * If npm has a newer mcp-server, replace this process with it.
 * Returns "reexec" after the child exits (caller should process.exit).
 */
export async function maybeReexecLatest(
  input: ReexecLatestInput,
): Promise<{ status: AutoUpdateResult; child?: ChildProcess }> {
  if (input.env.PRISM_SKIP_SELF_UPDATE === "1") {
    return { status: "skipped" };
  }
  if (input.env.PRISM_DISPATCH_ROLE === "worker") {
    return { status: "skipped" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const latest = await fetchLatestMcpVersion(fetchImpl);
  if (latest === undefined || !isNewerVersion(latest, input.currentVersion)) {
    return { status: "current" };
  }

  input.write?.(
    `prism-mcp: ${input.currentVersion} is stale; starting ${latest}\n`,
  );
  const spawnImpl = input.spawnImpl ?? spawn;
  const child = spawnImpl(
    "npx",
    ["-y", `${PACKAGE_NAME}@${latest}`, ...input.argv],
    {
      env: { ...input.env, PRISM_SKIP_SELF_UPDATE: "1" },
      stdio: "inherit",
    },
  );
  return { status: "reexec", child };
}
