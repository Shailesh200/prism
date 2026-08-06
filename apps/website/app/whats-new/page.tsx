import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { parseChangelog } from "@/lib/changelog";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What's new",
  description: "Prism release timeline and highlight posts.",
};

type PostMeta = {
  slug: string;
  title: string;
  description: string;
  version?: string;
};

async function loadPosts(): Promise<PostMeta[]> {
  const dir = path.join(process.cwd(), "content/posts");
  const entries = await readdir(dir).catch(() => [] as string[]);
  const posts: PostMeta[] = [];
  for (const file of entries) {
    if (!file.endsWith(".mdx")) continue;
    const text = await readFile(path.join(dir, file), "utf8");
    const fm = /^---\n([\s\S]*?)\n---/.exec(text);
    const fields = Object.fromEntries(
      (fm?.[1] ?? "")
        .split("\n")
        .map((line) => line.split(":").map((p) => p.trim()))
        .filter((p) => p.length >= 2)
        .map(([k, ...rest]) => [k, rest.join(":").replace(/^["']|["']$/g, "")]),
    );
    posts.push({
      slug: file.replace(/\.mdx$/, ""),
      title: fields.title ?? file,
      description: fields.description ?? "",
      version: fields.version,
    });
  }
  return posts;
}

export default async function WhatsNewPage() {
  const changelog = await readFile(
    path.join(process.cwd(), "../../CHANGELOG.md"),
    "utf8",
  );
  const releases = parseChangelog(changelog);
  const posts = await loadPosts();

  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-16">
        <header className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">What's new</h1>
          <p className="text-fd-muted-foreground">
            Release timeline from the product changelog, plus optional highlight
            posts.
          </p>
        </header>

        {posts.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-xl font-medium">Highlights</h2>
            <ul className="space-y-3">
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/whats-new/${post.slug}`}
                    className="block rounded-xl border border-fd-border p-4 hover:border-[var(--prism-brand,#00c2c2)]"
                  >
                    <div className="font-medium">{post.title}</div>
                    <p className="mt-1 text-sm text-fd-muted-foreground">
                      {post.description}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-8">
          {releases.map((release) => (
            <article key={release.version} className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                {release.version}
              </h2>
              <ul className="list-disc space-y-2 pl-5 text-fd-muted-foreground">
                {release.bullets.map((b) => (
                  <li key={b} className="leading-relaxed">
                    {b.replace(/\*\*/g, "")}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </main>
    </HomeLayout>
  );
}
