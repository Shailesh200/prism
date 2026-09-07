import { posts } from "@/.source/server";
import { source } from "@/lib/source";
import { buildSitemap } from "@/lib/seo";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap({
    docsUrls: source.getPages().map((page) => page.url),
    postSlugs: posts.map((entry) => entry.info.path.replace(/\.mdx$/, "")),
  });
}
