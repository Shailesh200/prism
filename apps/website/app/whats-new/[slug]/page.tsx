import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { postSource } from "@/lib/source";
import { getMDXComponents } from "@/components/mdx";
import { DocsBody } from "fumadocs-ui/layouts/notebook/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";

type Props = { params: Promise<{ slug: string }> };

function pageFor(slug: string) {
  return postSource.getPage([slug]);
}

export function generateStaticParams() {
  return postSource.getPages().map((page) => ({
    slug: page.slugs[0] ?? page.url.replace(/^\/whats-new\//, ""),
  }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const page = pageFor(slug);
  if (!page) return {};
  return {
    title: page.data.title,
    description: page.data.description,
  };
}

export default async function PostPage(props: Props) {
  const { slug } = await props.params;
  const page = pageFor(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <DocsBody>
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              {page.data.title}
            </h1>
            {page.data.description ? (
              <p className="text-fd-muted-foreground">
                {page.data.description}
              </p>
            ) : null}
            <MDX components={getMDXComponents()} />
          </DocsBody>
        </main>
      </PageEnter>
    </HomeLayout>
  );
}
