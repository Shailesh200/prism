import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseChangelog, type ChangelogRelease } from "@/lib/changelog";
import { GITHUB_OWNER, GITHUB_REPO } from "@/lib/github";

/** Versions per changelog page. */
export const PER_PAGE = 10;

/** How often the live changelog is allowed to go stale, in seconds. */
export const CHANGELOG_REVALIDATE_SECONDS = 300;

/** CHANGELOG.md on main. A new version shows up without a website deploy. */
export const GITHUB_CHANGELOG_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/CHANGELOG.md`;

const LOCAL_CHANGELOG = path.join(process.cwd(), "../../CHANGELOG.md");

function looksLikeChangelog(text: string): boolean {
  return /^##\s+\d+\.\d+\.\d+/m.test(text);
}

/**
 * The changelog on GitHub main. The copy in this checkout is the fallback
 * for a build or a request that cannot reach GitHub.
 */
export async function readChangelogMarkdown(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  try {
    const res = await fetchImpl(GITHUB_CHANGELOG_URL, {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: CHANGELOG_REVALIDATE_SECONDS },
    });
    if (res.ok) {
      const text = await res.text();
      if (looksLikeChangelog(text)) return text;
    }
  } catch {
    // The local file is the same document when this build is current.
  }
  return readFile(LOCAL_CHANGELOG, "utf8");
}

/** Every version on the changelog, newest first, as written in CHANGELOG.md. */
export async function changelogEntries(): Promise<ChangelogRelease[]> {
  return parseChangelog(await readChangelogMarkdown());
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PER_PAGE));
}

export function pageHref(page: number): string {
  return page <= 1 ? "/changelog" : `/changelog/page/${page}`;
}

/** The page a version is on, or 1 when it is not listed. */
export function pageOf(version: string, versions: readonly string[]): number {
  const i = versions.indexOf(version);
  return i < 0 ? 1 : Math.floor(i / PER_PAGE) + 1;
}

/** Link to a version's notes, on whichever page holds it. */
export function versionHref(
  version: string,
  versions: readonly string[],
): string {
  return `${pageHref(pageOf(version, versions))}#${version}`;
}
