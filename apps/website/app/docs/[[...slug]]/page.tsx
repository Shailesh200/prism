import Link from "next/link";
import { notFound } from "next/navigation";
import { DocBlocks, headingId } from "@/components/paper/doc-body";
import { JsonLd } from "@/components/json-ld";
import { DOCS, docHref, findDoc } from "@/lib/paper/docs-content";
import { docsBreadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug?: string[] }> };

function keyFrom(slug: string[] | undefined): string {
  return slug?.join("/") ?? "";
}

export function generateStaticParams() {
  return DOCS.map((page) => ({
    slug: page.slug ? page.slug.split("/") : [],
  }));
}

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const page = findDoc(keyFrom(params.slug));
  if (!page) return {};
  return pageMetadata({
    title: page.title,
    description: page.description,
    path: docHref(page.slug),
  });
}

export default async function DocsPage(props: Props) {
  const params = await props.params;
  const key = keyFrom(params.slug);
  const page = findDoc(key);
  if (!page) notFound();

  const index = DOCS.findIndex((entry) => entry.slug === page.slug);
  const prev = index > 0 ? DOCS[index - 1] : undefined;
  const next = index < DOCS.length - 1 ? DOCS[index + 1] : undefined;
  const headings = page.blocks.filter((block) => block.kind === "h2");

  return (
    <>
      <article className="article">
        <JsonLd
          data={docsBreadcrumbJsonLd({
            title: page.title,
            url: docHref(page.slug),
          })}
        />
        {page.slug === "faq" ? <JsonLd data={faqJsonLd()} /> : null}
        <div className="crumb">Docs / {page.group}</div>
        <h1>{page.title}</h1>
        <p className="lede" style={{ fontSize: 19 }}>
          {page.description}
        </p>
        <DocBlocks blocks={page.blocks} />
        <div className="pager">
          {prev ? (
            <Link href={docHref(prev.slug)}>
              <small>← Previous</small>
              {prev.title}
            </Link>
          ) : (
            <span style={{ flex: 1 }} />
          )}
          {next ? (
            <Link href={docHref(next.slug)} style={{ textAlign: "right" }}>
              <small>Next →</small>
              {next.title}
            </Link>
          ) : (
            <span style={{ flex: 1 }} />
          )}
        </div>
      </article>
      <aside className="toc">
        <h2>On this page</h2>
        {headings.map((block) =>
          block.kind === "h2" ? (
            <a key={block.text} href={`#${headingId(block.text)}`}>
              {block.text}
            </a>
          ) : null,
        )}
      </aside>
    </>
  );
}
