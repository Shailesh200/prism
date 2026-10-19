import { feedReleases } from "@/lib/changelog";
import {
  changelogEntries,
  readChangelogMarkdown,
  versionHref,
} from "@/lib/changelog-pages";
import { publishedTimes } from "@/lib/release-times";
import { siteOrigin } from "@/lib/seo";

/** Literal: Next reads this at build time. Same interval as CHANGELOG_REVALIDATE_SECONDS. */
export const revalidate = 300;

export async function GET() {
  const site = siteOrigin();
  const changelog = await readChangelogMarkdown();
  const releases = feedReleases(changelog);
  const versions = (await changelogEntries()).map((r) => r.version);
  const times = await publishedTimes();
  const items = releases
    .map((r) => {
      const published = times[r.version];
      const pubDate = published
        ? `\n    <pubDate>${new Date(published).toUTCString()}</pubDate>`
        : "";
      return `  <item>
    <title>Prism ${r.version}</title>
    <link>${site}${versionHref(r.version, versions)}</link>
    <guid>${site}${versionHref(r.version, versions)}</guid>${pubDate}
    <description><![CDATA[${r.bullets.join(" · ")}]]></description>
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Prism changelog</title>
  <link>${site}/changelog</link>
  <description>Prism release notes</description>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
