import { feedReleases } from "@/lib/changelog";
import {
  CHANGELOG_REVALIDATE_SECONDS,
  changelogEntries,
  readChangelogMarkdown,
  versionHref,
} from "@/lib/changelog-pages";
import { siteOrigin } from "@/lib/seo";

export const revalidate = CHANGELOG_REVALIDATE_SECONDS;

export async function GET() {
  const site = siteOrigin();
  const changelog = await readChangelogMarkdown();
  const releases = feedReleases(changelog);
  const versions = (await changelogEntries()).map((r) => r.version);
  const items = releases
    .map(
      (r) => `  <item>
    <title>Prism ${r.version}</title>
    <link>${site}${versionHref(r.version, versions)}</link>
    <guid>${site}${versionHref(r.version, versions)}</guid>
    <description><![CDATA[${r.bullets.join(" · ")}]]></description>
  </item>`,
    )
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
