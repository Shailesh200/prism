import { notFound } from "next/navigation";
import { changelogEntries, pageCount } from "@/lib/changelog-pages";
import { pageMetadata } from "@/lib/seo";
import { ChangelogView } from "../../changelog-view";

type Props = { params: Promise<{ n: string }> };

export const dynamicParams = false;

/** Page 1 is /changelog; this route serves pages 2 and up. */
export async function generateStaticParams() {
  const pages = pageCount((await changelogEntries()).length);
  return Array.from({ length: pages - 1 }, (_, i) => ({ n: String(i + 2) }));
}

export async function generateMetadata({ params }: Props) {
  const { n } = await params;
  return pageMetadata({
    title: `Changelog, page ${n}`,
    description: `Prism release notes, page ${n}.`,
    path: `/changelog/page/${n}`,
  });
}

export default async function ChangelogPageN({ params }: Props) {
  const page = Number((await params).n);
  const pages = pageCount((await changelogEntries()).length);
  if (!Number.isInteger(page) || page < 2 || page > pages) notFound();
  return <ChangelogView page={page} />;
}
