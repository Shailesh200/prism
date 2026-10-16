import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Shell } from "@/components/paper/shell";
import { posts } from "@/.source/server";
import { getMDXComponents } from "@/components/mdx";
import { articleJsonLd, pageMetadata, SITE_DESCRIPTION } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

function findPost(slug: string) {
  return posts.find((entry) => entry.info.path.replace(/\.mdx$/, "") === slug);
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
    path: `/whats-new/${slug}`,
    type: "article",
  });
}

export default async function PostPage(props: Props) {
  const { slug } = await props.params;
  const post = findPost(slug);
  if (!post) notFound();
  const MDX = post.body;

  return (
    <Shell>
      <article
        className="article"
        style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px 80px" }}
      >
        <JsonLd
          data={articleJsonLd({
            title: post.title ?? slug,
            description: post.description,
            url: `/whats-new/${slug}`,
          })}
        />
        <div className="crumb">
          <a href="/changelog">Changelog</a>
        </div>
        <h1>{post.title ?? slug}</h1>
        <MDX components={getMDXComponents()} />
      </article>
    </Shell>
  );
}
