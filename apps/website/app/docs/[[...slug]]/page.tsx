import { source } from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/notebook/page";
import { notFound } from "next/navigation";
import { DocsCrumb } from "@/components/docs-chrome";
import { getMDXComponents, withPulseAnchors } from "@/components/mdx";
import { JsonLd } from "@/components/json-ld";
import { createRelativeLink } from "fumadocs-ui/mdx";
import {
  docsBreadcrumbJsonLd,
  faqJsonLd,
  pageMetadata,
  techArticleJsonLd,
} from "@/lib/seo";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const isFaq = params.slug?.[0] === "help" && params.slug?.[1] === "faq";

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      breadcrumb={{ enabled: true, component: <DocsCrumb /> }}
      footer={{
        className: "docs-pager",
        children: page.data.source ? (
          <p className="docs-source">Source: {page.data.source}</p>
        ) : null,
      }}
    >
      <JsonLd
        data={docsBreadcrumbJsonLd({
          title: page.data.title,
          url: page.url,
        })}
      />
      <JsonLd
        data={techArticleJsonLd({
          title: page.data.title,
          description: page.data.description,
          url: page.url,
          dateModified: page.data.lastModified,
        })}
      />
      {isFaq ? <JsonLd data={faqJsonLd()} /> : null}
      <DocsTitle className="docs-h1">{page.data.title}</DocsTitle>
      <DocsDescription className="docs-lede">
        {page.data.description}
      </DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: withPulseAnchors(createRelativeLink(source, page)),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  // "· Docs" keeps a docs title apart from the product page of the same name.
  return pageMetadata({
    title: `${page.data.title} · Docs`,
    description: page.data.description,
    path: page.url,
  });
}
