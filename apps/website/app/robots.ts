import { isPreviewDeploy, siteHost, siteOrigin } from "../lib/seo";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  if (isPreviewDeploy()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  const site = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/oauth", "/oauth/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: siteHost(),
  };
}
