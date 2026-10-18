/**
 * Canonical SEO for prismhq.in. Every public page should go through
 * `pageMetadata` so title, description, canonical, and OG stay in sync.
 *
 * Claims in JSON-LD must stay literally true (free, local-first, no hosted
 * product). An inaccurate schema is worse than none.
 */

import type { Metadata, MetadataRoute } from "next";
import { PRISM_TOOL_COUNT } from "@repo-prism/shared";
import { AGENTS } from "./agents";
import { GITHUB } from "./github";
import { HOW_IT_WORKS, PRODUCTS } from "./nav";

export const SITE_NAME = "Prism";

export const SITE_DEFAULT_TITLE =
  "Prism — Software intelligence for coding agents";

export const SITE_DESCRIPTION =
  "Software intelligence for coding agents. Prepare hands your agent the files to edit. Lenses keep the work in your house style and on your map. Review reads the change and returns findings, then a Receipt: SHIP, NOT PROVEN, or NO-SHIP. Free, MIT, runs on your machine.";

/** The share card from app/opengraph-image.tsx, used by every page. */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Prism: software intelligence for coding agents",
};

/** The release feed, linked from every page head. */
export const RSS_PATH = "/whats-new/rss.xml";

export const MARKETING_ROUTES: Array<{
  path: string;
  changeFrequency: NonNullable<
    MetadataRoute.Sitemap[number]["changeFrequency"]
  >;
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/install", changeFrequency: "weekly", priority: 0.9 },
  ...AGENTS.map((agent) => ({
    path: `/install/${agent.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  })),
  ...PRODUCTS.map((product) => ({
    path: product.href,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  })),
  {
    path: HOW_IT_WORKS.href,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  },
  { path: "/benchmarks", changeFrequency: "monthly", priority: 0.7 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/open-source", changeFrequency: "yearly", priority: 0.4 },
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
    alternates: {
      canonical: url,
      types: { "application/rss+xml": absoluteUrl(RSS_PATH) },
    },
    openGraph: {
      type: opts.type ?? "website",
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      title: ogTitle,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [OG_IMAGE.url],
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
      types: { "application/rss+xml": absoluteUrl(RSS_PATH) },
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "48x48" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: SITE_NAME,
      title: SITE_DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE.url],
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
  /** Changelog page count; pages 2… are `/changelog/page/N`. */
  changelogPages?: number;
  /** Last commit time per docs URL, where git knows it. */
  docsModified?: Record<string, Date | undefined>;
  /** Build time: the lastModified of every page without a better date. */
  now?: Date;
}): MetadataRoute.Sitemap {
  const now = input.now ?? new Date();
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
    out.push({
      url,
      lastModified: input.docsModified?.[path] ?? now,
      ...extra,
    });
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
  for (let page = 2; page <= (input.changelogPages ?? 1); page += 1) {
    add(`/changelog/page/${page}`, {
      changeFrequency: "monthly",
      priority: 0.4,
    });
  }
  for (const slug of input.postSlugs) {
    add(`/changelog/${slug}`, {
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
        description: SITE_DESCRIPTION,
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
        license: "https://opensource.org/licenses/MIT",
        softwareHelp: { "@type": "CreativeWork", url: absoluteUrl("/docs") },
        image: absoluteUrl(OG_IMAGE.url),
        description: SITE_DESCRIPTION,
        featureList: [
          "Prepare: the files to edit, the tests, and code to reuse",
          "Lenses: Dev, QA, and Architect, plus your own",
          "Review: Critical, High, Low, and Nit findings, then a Receipt",
          "Blast radius per symbol, with safe delete and rename",
          "Receipts: SHIP, NOT PROVEN or NO-SHIP from your own checks",
          "Local repository map",
          "House style and habits",
          `MCP server with ${PRISM_TOOL_COUNT} tools for AI agents`,
          "CLI for terminals and CI",
          "Installs next to your coding agent",
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
          text: "No. Analysis makes no network calls, and a test fails the build if it does. The one request is a daily check of the npm registry for a newer version. It sends no repository data. Set PRISM_SKIP_SELF_UPDATE=1 to turn it off.",
        },
      },
      {
        "@type": "Question",
        name: "Is Prism an AI coding assistant?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Prism writes no code and its analysis uses no model. It answers questions about your repository’s structure for the agent you already use.",
        },
      },
      {
        "@type": "Question",
        name: "What is Prepare?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "One call before an edit (the prepare_change tool). It returns files to open, helpers to reuse, a house-style example, notes and a work order. The automatic prompt lists at most three files Prism is sure of, with nearby tests and one run command.",
        },
      },
      {
        "@type": "Question",
        name: "Is there a hosted version?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Prism runs on your machine. There is no account and no server.",
        },
      },
      {
        "@type": "Question",
        name: "How much does it cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Nothing. Prism is free and MIT licensed.",
        },
      },
    ],
  };
}

/** A BreadcrumbList from Home down to the page, as `{ name, path }` steps after Home. */
export function breadcrumbJsonLd(
  steps: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  const items = [{ name: "Home", path: "/" }, ...steps];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: absoluteUrl(step.path),
    })),
  };
}

export function docsBreadcrumbJsonLd(page: {
  title: string;
  url: string;
}): Record<string, unknown> {
  const docs = { name: "Docs", path: "/docs" };
  return breadcrumbJsonLd(
    page.url === "/docs"
      ? [docs]
      : [docs, { name: page.title, path: page.url }],
  );
}

/** A docs page as a TechArticle. dateModified is the file's last commit, when known. */
export function techArticleJsonLd(page: {
  title: string;
  description?: string;
  url: string;
  dateModified?: Date;
}): Record<string, unknown> {
  const url = absoluteUrl(page.url);
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title,
    description: page.description,
    url,
    mainEntityOfPage: url,
    inLanguage: "en",
    image: absoluteUrl(OG_IMAGE.url),
    ...(page.dateModified
      ? { dateModified: page.dateModified.toISOString() }
      : {}),
    about: { "@id": `${origin}/#app` },
    isPartOf: { "@id": `${origin}/#website` },
    publisher: { "@id": `${origin}/#organization` },
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
