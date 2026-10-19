/** Public GitHub identity for the Star control and footer. */

export const GITHUB_OWNER = "Shailesh200";
export const GITHUB_REPO = "prism";
export const GITHUB = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

export const GITHUB_API_REPO = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

export function parseStarCount(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const count = (payload as { stargazers_count?: unknown }).stargazers_count;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
    return null;
  }
  return Math.trunc(count);
}

const COMPACT = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 12 → "12", 1500 → "1.5k", 1_200_000 → "1.2m". */
export function formatStarCount(count: number): string {
  return COMPACT.format(count).toLowerCase();
}

/**
 * Public star count, cached by Next for an hour. No token: a private repo,
 * a rate limit or a network error gives null and the button shows no count.
 */
export async function fetchStarCount(
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const res = await fetchImpl(GITHUB_API_REPO, {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const payload: unknown = await res.json();
    if ((payload as { private?: unknown } | null)?.private === true)
      return null;
    return parseStarCount(payload);
  } catch {
    return null;
  }
}
