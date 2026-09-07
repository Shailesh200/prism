import { describe, expect, it } from "vitest";
import {
  MARKETING_ROUTES,
  absoluteUrl,
  articleJsonLd,
  brandedTitle,
  buildSitemap,
  docsPriority,
  faqJsonLd,
  pageMetadata,
  shouldIndexPath,
  siteOrigin,
  websiteJsonLd,
} from "./seo";

describe("seo", () => {
  it("canonicalises the production origin", () => {
    expect(siteOrigin()).toBe("https://www.prismhq.in");
    expect(absoluteUrl("/")).toBe("https://www.prismhq.in");
    expect(absoluteUrl("/install")).toBe("https://www.prismhq.in/install");
  });

  it("keeps admin, oauth, and /features out of the index", () => {
    expect(shouldIndexPath("/admin")).toBe(false);
    expect(shouldIndexPath("/admin/docs/overview")).toBe(false);
    expect(shouldIndexPath("/oauth")).toBe(false);
    expect(shouldIndexPath("/features")).toBe(false);
    expect(shouldIndexPath("/install")).toBe(true);
    expect(shouldIndexPath("/docs/start/install")).toBe(true);
  });

  it("builds a sitemap of public URLs only", () => {
    const urls = buildSitemap({
      docsUrls: ["/docs", "/docs/start/install", "/admin/docs/overview"],
      postSlugs: ["1-8-0-console"],
    }).map((entry) => entry.url);

    expect(urls).toContain("https://www.prismhq.in");
    expect(urls).toContain("https://www.prismhq.in/install");
    expect(urls).toContain("https://www.prismhq.in/docs");
    expect(urls).toContain("https://www.prismhq.in/docs/start/install");
    expect(urls).toContain("https://www.prismhq.in/whats-new/1-8-0-console");
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);
    expect(urls.some((url) => url.includes("/features"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
    expect(MARKETING_ROUTES.some((route) => route.path === "/features")).toBe(
      false,
    );
  });

  it("ranks install and start docs above legal pages", () => {
    expect(docsPriority("/docs/start/install")).toBeGreaterThan(
      docsPriority("/docs/help/known-limitations"),
    );
  });

  it("sets canonical and Open Graph URL on every page", () => {
    const meta = pageMetadata({
      title: "Install",
      description: "Pick a surface.",
      path: "/install",
    });
    expect(meta.alternates?.canonical).toBe("https://www.prismhq.in/install");
    expect(meta.openGraph?.url).toBe("https://www.prismhq.in/install");
    expect(meta.openGraph?.title).toBe(brandedTitle("Install"));
    expect(
      meta.twitter && "card" in meta.twitter ? meta.twitter.card : undefined,
    ).toBe("summary_large_image");
  });

  it("noindexes pages that must stay out of Search", () => {
    const meta = pageMetadata({
      title: "Architecture",
      description: "Internal.",
      path: "/admin/docs/overview",
    });
    expect(meta.robots).toMatchObject({ index: false, follow: false });
    expect(
      pageMetadata({
        title: "Features",
        path: "/features",
        index: false,
        follow: true,
      }).robots,
    ).toMatchObject({ index: false, follow: true });
  });

  it("emits true SoftwareApplication and FAQ claims", () => {
    const graph = websiteJsonLd();
    const apps = (graph["@graph"] as Array<Record<string, unknown>>).filter(
      (node) => node["@type"] === "SoftwareApplication",
    );
    expect(apps).toHaveLength(1);
    expect(apps[0]?.isAccessibleForFree).toBe(true);
    expect(apps[0]?.offers).toMatchObject({ price: 0, priceCurrency: "USD" });

    const faq = faqJsonLd();
    const names = (faq.mainEntity as Array<{ name: string }>).map(
      (item) => item.name,
    );
    expect(names).toContain("Does my code leave my machine?");
    expect(names).toContain("Is there a hosted version?");

    const article = articleJsonLd({
      title: "Console",
      url: "/whats-new/1-8-0-console",
    });
    expect(article["@type"]).toBe("Article");
    expect(article.url).toBe("https://www.prismhq.in/whats-new/1-8-0-console");
  });
});
