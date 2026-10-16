import { posts } from "@/.source/server";
import { DOCS, docHref } from "@/lib/paper/docs-content";
import { buildSitemap } from "@/lib/seo";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap({
    docsUrls: DOCS.map((page) => docHref(page.slug)),
    postSlugs: posts.map((entry) => entry.info.path.replace(/\.mdx$/, "")),
  });
}
