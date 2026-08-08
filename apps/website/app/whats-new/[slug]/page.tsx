import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";

type Props = { params: Promise<{ slug: string }> };

async function loadPost(slug: string) {
  const file = path.join(process.cwd(), "content/posts", `${slug}.mdx`);
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  return [{ slug: "1-0-ga" }];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const text = await loadPost(slug);
  if (!text) return {};
  const title = /^title:\s*"?([^"\n]+)"?/m.exec(text)?.[1] ?? slug;
  const description =
    /^description:\s*"?([^"\n]+)"?/m.exec(text)?.[1] ?? undefined;
  return { title, description };
}

export default async function PostPage(props: Props) {
  const { slug } = await props.params;
  const text = await loadPost(slug);
  if (!text) notFound();
  const title = /^title:\s*"?([^"\n]+)"?/m.exec(text)?.[1] ?? slug;
  const body = text.replace(/^---[\s\S]*?---\n/, "").trim();

  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <article className="space-y-6">
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              {title}
            </h1>
            <div className="space-y-4 whitespace-pre-wrap text-fd-muted-foreground leading-relaxed">
              {body}
            </div>
          </article>
        </main>
      </PageEnter>
    </HomeLayout>
  );
}
