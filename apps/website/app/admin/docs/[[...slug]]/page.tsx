import { adminSource } from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { notFound, redirect } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import type { Metadata } from "next";
import { createRelativeLink } from "fumadocs-ui/mdx";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  if (!params.slug || params.slug.length === 0) {
    redirect("/admin/docs/overview");
  }
  const page = adminSource.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(adminSource, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return adminSource.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  if (!params.slug || params.slug.length === 0) {
    return {
      title: "Architecture",
      robots: { index: false, follow: false },
    };
  }
  const page = adminSource.getPage(params.slug);
  if (!page) notFound();
  return {
    title: page.data.title,
    description: page.data.description,
    robots: { index: false, follow: false },
  };
}
