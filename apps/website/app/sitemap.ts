import { source } from "@/lib/source";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.prismhq.in";
  const staticRoutes = [
    "",
    "/docs",
    "/features",
    "/products",
    "/benchmarks",
    "/whats-new",
    "/privacy",
    "/security",
  ];
  const docs = source.getPages().map((page) => ({
    url: `${site}${page.url}`,
    lastModified: new Date(),
  }));

  return [
    ...staticRoutes.map((route) => ({
      url: `${site}${route || "/"}`,
      lastModified: new Date(),
    })),
    ...docs,
  ];
}
