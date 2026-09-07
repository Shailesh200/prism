import { adminSource } from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { notFound, redirect } from "next/navigation";
import { getMDXComponents, withPulseAnchors } from "@/components/mdx";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { pageMetadata } from "@/lib/seo";

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
            a: withPulseAnchors(createRelativeLink(adminSource, page)),
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
}) {
  const params = await props.params;
  if (!params.slug || params.slug.length === 0) {
    return pageMetadata({
      title: "Architecture",
      description: "Internal architecture docs.",
      path: "/admin/docs",
      index: false,
    });
  }
  const page = adminSource.getPage(params.slug);
  if (!page) notFound();
  return pageMetadata({
    title: page.data.title,
    description: page.data.description,
    path: page.url,
    index: false,
  });
}
