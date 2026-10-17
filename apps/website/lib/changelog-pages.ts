import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseChangelog,
  SITE_CURRENT_RELEASE,
  type ChangelogRelease,
} from "@/lib/changelog";

/** Versions per changelog page. */
export const PER_PAGE = 10;

/** Every version on the changelog, newest first: the hand-written 2.0.0, then CHANGELOG.md. */
export async function changelogEntries(): Promise<ChangelogRelease[]> {
  const markdown = await readFile(
    path.join(process.cwd(), "../../CHANGELOG.md"),
    "utf8",
  );
  const history = parseChangelog(markdown).filter(
    (release) => release.version !== SITE_CURRENT_RELEASE.version,
  );
  const current: ChangelogRelease = {
    version: SITE_CURRENT_RELEASE.version,
    title: SITE_CURRENT_RELEASE.summary,
    body: "",
    bullets: [],
    sections: [],
  };
  return [current, ...history];
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
