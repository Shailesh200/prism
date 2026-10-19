import { feedReleases } from "@/lib/changelog";
import { changelogEntries, versionHref } from "@/lib/changelog-pages";
import { siteOrigin } from "@/lib/seo";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Read at build time, so the deployed bundle never needs the file.
export const dynamic = "force-static";

export async function GET() {
  const site = siteOrigin();
  const changelog = await readFile(
    path.join(process.cwd(), "../../CHANGELOG.md"),
    "utf8",
  );
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
