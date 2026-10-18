import { posts } from "@/.source/server";
import { source } from "@/lib/source";
import { changelogEntries, pageCount } from "@/lib/changelog-pages";
import { buildSitemap } from "@/lib/seo";
import type { MetadataRoute } from "next";

/** Literal: Next reads this at build time. Same interval as CHANGELOG_REVALIDATE_SECONDS. */
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap({
    docsUrls: source.getPages().map((page) => page.url),
    docsModified: Object.fromEntries(
      source.getPages().map((page) => [page.url, page.data.lastModified]),
    ),
    postSlugs: posts.map((entry) => entry.info.path.replace(/\.mdx$/, "")),
    changelogPages: pageCount((await changelogEntries()).length),
  });
}
