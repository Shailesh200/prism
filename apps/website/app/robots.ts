import { isPreviewDeploy, siteHost, siteOrigin } from "../lib/seo";
import type { MetadataRoute } from "next";

const CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "Amazonbot",
  "meta-externalagent",
  "CCBot",
  "DuckAssistBot",
  "cohere-ai",
  "MistralAI-User",
];

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
  const disallow = ["/admin", "/admin/", "/oauth", "/oauth/"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Named so the welcome is explicit: search engines and AI crawlers may read every public page.
      { userAgent: CRAWLERS, allow: "/", disallow },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: siteHost(),
  };
}
