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

export function formatStarCount(count: number): string {
  if (count >= 1000) {
    const thousands = count / 1000;
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
  }
  return String(count);
}
