import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { SiteFooter } from "@/components/site-footer";
import { posts } from "@/.source/server";
import { getMDXComponents } from "@/components/mdx";

type Props = { params: Promise<{ slug: string }> };

function findPost(slug: string) {
  return posts.find((entry) => entry.info.path.replace(/\.mdx$/, "") === slug);
}

export function generateStaticParams() {
  return posts.map((entry) => ({
    slug: entry.info.path.replace(/\.mdx$/, ""),
  }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const post = findPost(slug);
  if (!post) return {};
  return {
    title: post.title ?? slug,
    description: post.description ?? undefined,
  };
}

export default async function PostPage(props: Props) {
  const { slug } = await props.params;
  const post = findPost(slug);
  if (!post) notFound();
  const MDX = post.body;

  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <article className="space-y-6">
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              {post.title ?? slug}
            </h1>
            <div className="prose max-w-none">
              <MDX components={getMDXComponents()} />
            </div>
          </article>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
