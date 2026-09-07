import { source } from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/notebook/page";
import { notFound } from "next/navigation";
import { getMDXComponents, withPulseAnchors } from "@/components/mdx";
import { JsonLd } from "@/components/json-ld";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { docsBreadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const isFaq = params.slug?.[0] === "help" && params.slug?.[1] === "faq";

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <JsonLd
        data={docsBreadcrumbJsonLd({
          title: page.data.title,
          url: page.url,
        })}
      />
      {isFaq ? <JsonLd data={faqJsonLd()} /> : null}
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
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

  return pageMetadata({
    title: page.data.title,
    description: page.data.description,
    path: page.url,
  });
}
