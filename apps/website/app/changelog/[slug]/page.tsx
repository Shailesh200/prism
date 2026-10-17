import { notFound } from "next/navigation";
import Link from "next/link";
import { posts } from "@/.source/server";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { getMDXComponents } from "@/components/mdx";
import { Callout } from "@/components/ui/callout";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { articleJsonLd, pageMetadata, SITE_DESCRIPTION } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

function findPost(slug: string) {
  return posts.find((entry) => entry.info.path.replace(/\.mdx$/, "") === slug);
}

/** 1.x notes carry the legacy banner. Version frontmatter wins; the slug is the fallback. */
function isOneXPost(version: string | undefined, slug: string): boolean {
  if (version !== undefined) return version.startsWith("1.");
  return slug.startsWith("1-");
}

export function generateStaticParams() {
  return posts.map((entry) => ({
    slug: entry.info.path.replace(/\.mdx$/, ""),
  }));
}

export async function generateMetadata(props: Props) {
  const { slug } = await props.params;
  const post = findPost(slug);
  if (!post) return {};
  return pageMetadata({
    title: post.title ?? slug,
    description: post.description ?? SITE_DESCRIPTION,
    path: `/changelog/${slug}`,
    type: "article",
  });
}

export default async function PostPage(props: Props) {
  const { slug } = await props.params;
  const post = findPost(slug);
  if (!post) notFound();
  const MDX = post.body;

  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          eyebrow={post.version ? `Prism ${post.version}` : "Changelog"}
          title={post.title ?? slug}
          lede={post.description}
        />
        <section className="sec">
          <Container>
            <JsonLd
              data={articleJsonLd({
                title: post.title ?? slug,
                description: post.description,
                url: `/changelog/${slug}`,
              })}
            />
            {isOneXPost(post.version, slug) ? (
              <Callout>
                This note is from a 1.x release, as it was written then. Prism
                2.0 removed Dispatch, the VS Code and Cursor extensions,
                app-shell and the playground.{" "}
                <Link href="/changelog">
                  <u>Current changes</u>
                </Link>
              </Callout>
            ) : null}
            <article className="prose mt-8 max-w-3xl">
              <MDX components={getMDXComponents()} />
            </article>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
