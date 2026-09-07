import { parseChangelog } from "@/lib/changelog";
import { siteOrigin } from "@/lib/seo";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const site = siteOrigin();
  const changelog = await readFile(
    path.join(process.cwd(), "../../CHANGELOG.md"),
    "utf8",
  );
  const releases = parseChangelog(changelog).slice(0, 20);
  const items = releases
    .map(
      (r) => `  <item>
    <title>Prism ${r.version}</title>
    <link>${site}/whats-new#${r.version}</link>
    <guid>${site}/whats-new#${r.version}</guid>
    <description><![CDATA[${r.bullets.join(" · ")}]]></description>
  </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Prism — What's new</title>
  <link>${site}/whats-new</link>
  <description>Prism release timeline</description>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
