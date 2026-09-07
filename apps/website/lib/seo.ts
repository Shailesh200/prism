/**
 * Canonical SEO for prismhq.in. Every public page should go through
 * `pageMetadata` so title, description, canonical, and OG stay in sync.
 *
 * Claims in JSON-LD must stay literally true (free, local-first, no hosted
 * product). An inaccurate schema is worse than none.
 */

import type { Metadata, MetadataRoute } from "next";
import { GITHUB } from "./github";
import { PRISM_TOOL_COUNT } from "@repo-prism/shared";

export const SITE_NAME = "Prism";

export const SITE_DEFAULT_TITLE = "Prism — local-first software intelligence";

export const SITE_DESCRIPTION =
  "Local-first software intelligence — a teammate for every agent. Maps, graphs, impact, health, and Dispatch on your machine. Not a coding model.";

export const MARKETING_ROUTES: Array<{
  path: string;
  changeFrequency: NonNullable<
    MetadataRoute.Sitemap[number]["changeFrequency"]
  >;
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/install", changeFrequency: "weekly", priority: 0.9 },
  { path: "/products", changeFrequency: "monthly", priority: 0.8 },
  { path: "/benchmarks", changeFrequency: "monthly", priority: 0.7 },
  { path: "/whats-new", changeFrequency: "weekly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/security", changeFrequency: "yearly", priority: 0.3 },
];

export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.prismhq.in";
  return raw.replace(/\/+$/, "");
}

export function siteHost(): string {
  return new URL(siteOrigin()).host;
}

export function absoluteUrl(path = "/"): string {
  const origin = siteOrigin();
  if (!path || path === "/") return origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isPreviewDeploy(): boolean {
  const env = process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV;
  return Boolean(env && env !== "production");
}

export function shouldIndexPath(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/features" || normalized.startsWith("/features/")) {
    return false;
  }
  if (normalized === "/admin" || normalized.startsWith("/admin/")) {
    return false;
  }
  if (normalized === "/oauth" || normalized.startsWith("/oauth/")) {
    return false;
  }
  return true;
}

export function docsPriority(path: string): number {
  if (path === "/docs" || path === "/docs/") return 0.9;
  if (path === "/docs/start/install" || path === "/docs/what-is-prism") {
    return 0.9;
  }
  if (path === "/docs/usage" || path.startsWith("/docs/start/")) return 0.8;
  if (path.startsWith("/docs/guides/")) return 0.8;
  return 0.6;
}

export function brandedTitle(title?: string): string {
  return title ? `${title} · ${SITE_NAME}` : SITE_DEFAULT_TITLE;
}

export function pageMetadata(opts: {
  title?: string;
  description?: string;
  path: string;
  type?: "website" | "article";
  index?: boolean;
  follow?: boolean;
}): Metadata {
  const url = absoluteUrl(opts.path);
  const ogTitle = brandedTitle(opts.title);
  const description = opts.description ?? SITE_DESCRIPTION;
  const index = opts.index ?? shouldIndexPath(opts.path);
  const follow = opts.follow ?? index;

  return {
    ...(opts.title ? { title: opts.title } : {}),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: opts.type ?? "website",
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      title: ogTitle,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
    },
    robots: index
      ? {
          index: true,
          follow,
          googleBot: {
            index: true,
            follow,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        }
      : { index: false, follow },
  };
}

export function rootMetadata(): Metadata {
  const url = siteOrigin();
  const verification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  return {
    metadataBase: new URL(`${url}/`),
    title: {
      default: SITE_DEFAULT_TITLE,
      template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    category: "technology",
    authors: [{ name: SITE_NAME, url }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    formatDetection: { telephone: false, email: false, address: false },
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": absoluteUrl("/whats-new/rss.xml"),
      },
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: SITE_NAME,
      title: SITE_DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    ...(verification ? { verification: { google: verification } } : {}),
  };
}

export function buildSitemap(input: {
  docsUrls: string[];
  postSlugs: string[];
}): MetadataRoute.Sitemap {
  const seen = new Set<string>();
  const out: MetadataRoute.Sitemap = [];

  const add = (
    path: string,
    extra: Pick<MetadataRoute.Sitemap[number], "changeFrequency" | "priority">,
  ) => {
    if (!shouldIndexPath(path)) return;
    const url = absoluteUrl(path);
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, ...extra });
  };

  for (const route of MARKETING_ROUTES) {
    add(route.path, {
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    });
  }
  for (const docsUrl of input.docsUrls) {
    add(docsUrl, {
      changeFrequency: "monthly",
      priority: docsPriority(docsUrl),
    });
  }
  for (const slug of input.postSlugs) {
    add(`/whats-new/${slug}`, {
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }
  return out;
}

export function websiteJsonLd(): Record<string, unknown> {
  const url = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${url}/#organization`,
        name: SITE_NAME,
        url,
        logo: absoluteUrl("/icon.png"),
        sameAs: [GITHUB],
      },
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        name: SITE_NAME,
        url,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${url}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}/#app`,
        name: SITE_NAME,
        url,
        applicationCategory: "DeveloperApplication",
        operatingSystem: ["macOS", "Windows", "Linux"],
        offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
        isAccessibleForFree: true,
        description:
          "Local-first software intelligence engine. Repository maps, dependency graphs, blast radius, and health — exposed as a CLI, IDE extensions, and an MCP server for AI agents. Analysis makes no network calls.",
        featureList: [
          "Repository map and DNA",
          "Blast radius and impact analysis",
          "Engineering health tracking",
          `MCP server with ${PRISM_TOOL_COUNT} tools for AI agents`,
          "Dispatch background teammates",
          "CLI for terminals and CI",
          "VS Code and Cursor extensions",
        ],
        publisher: { "@id": `${url}/#organization` },
      },
    ],
  };
}

/** Answers copied from docs/help/faq.md — keep in lockstep. */
export function faqJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Does my code leave my machine?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Analysis makes zero network calls, enforced by a test that runs the whole analysis surface with the socket layer trapped. A few optional features do reach out — GitHub metadata, Core Web Vitals, avatars — and each is off until you turn it on individually. None of them send source code.",
        },
      },
      {
        "@type": "Question",
        name: "Is Prism an AI coding assistant?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. The analysis engine has no model in it and generates nothing — it answers structural questions and makes an AI assistant considerably better by giving it real knowledge of your repository.",
        },
      },
      {
        "@type": "Question",
        name: "Which languages?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "TypeScript and JavaScript are fully analysed — imports, symbols, references, graphs, the lot. Other languages are indexed for structure, size and churn, so file-level and git-derived signals work everywhere. Symbol-level analysis does not.",
        },
      },
      {
        "@type": "Question",
        name: "Is there a hosted version?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No, and that is a design decision rather than a roadmap gap. Prism is local-first. There is no account, no server, and nothing to sign up for.",
        },
      },
      {
        "@type": "Question",
        name: "How much does it cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Nothing. See the repository for licence details.",
        },
      },
    ],
  };
}

export function docsBreadcrumbJsonLd(page: {
  title: string;
  url: string;
}): Record<string, unknown> {
  const home = {
    "@type": "ListItem",
    position: 1,
    name: "Home",
    item: absoluteUrl("/"),
  };
  const docs = {
    "@type": "ListItem",
    position: 2,
    name: "Docs",
    item: absoluteUrl("/docs"),
  };
  if (page.url === "/docs") {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [home, docs],
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      home,
      docs,
      {
        "@type": "ListItem",
        position: 3,
        name: page.title,
        item: absoluteUrl(page.url),
      },
    ],
  };
}

export function articleJsonLd(page: {
  title: string;
  description?: string;
  url: string;
}): Record<string, unknown> {
  const url = absoluteUrl(page.url);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    url,
    mainEntityOfPage: url,
    inLanguage: "en",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: siteOrigin(),
    },
  };
}
