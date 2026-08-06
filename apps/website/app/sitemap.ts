import { source } from "@/lib/source";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const staticRoutes = [
    "",
    "/docs",
    "/features",
    "/products",
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
