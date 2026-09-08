const REGISTRY_URL = "https://registry.npmjs.org/@repo-prism/mcp-server/latest";

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

export async function mcpUpdateStatus(currentVersion: string): Promise<{
  readonly current: string;
  readonly latest?: string;
  readonly stale: boolean;
}> {
  const latest = await fetchLatestMcpVersion();
  if (!latest) return { current: currentVersion, stale: false };
  return {
    current: currentVersion,
    latest,
    stale: isNewerVersion(latest, currentVersion),
  };
}
