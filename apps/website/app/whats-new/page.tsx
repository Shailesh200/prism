import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { parseChangelog } from "@/lib/changelog";
import { renderInlineMarkdown } from "@/lib/inline-markdown";
import { postSource } from "@/lib/source";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIntro } from "@/components/motion/SectionIntro";

export const metadata: Metadata = {
  title: "What's new",
  description: "Prism release timeline and highlight posts.",
};

export default async function WhatsNewPage() {
  const changelog = await readFile(
    path.join(process.cwd(), "../../CHANGELOG.md"),
    "utf8",
  );
  const releases = parseChangelog(changelog);
  const posts = postSource.getPages();

  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-16">
          <SectionIntro
            index="Nº CHANGELOG"
            title="What's new"
            description="Release timeline from the product changelog, plus optional highlight posts."
          />

          {posts.length > 0 ? (
            <section className="space-y-4">
              <Reveal>
                <h2 className="font-display text-xl font-medium">Highlights</h2>
              </Reveal>
              <ul className="divide-y divide-fd-border border-y border-fd-border">
                {posts.map((post, i) => (
                  <Reveal key={post.url} delay={i * 0.05} y={12}>
                    <li>
                      <Link
                        href={post.url}
                        className="block py-5 transition hover:text-fd-primary"
                      >
                        <div className="font-display font-medium text-fd-foreground">
                          {post.data.title}
                        </div>
                        {post.data.description ? (
                          <p className="mt-1 text-sm text-fd-muted-foreground">
                            {post.data.description}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-8">
            {releases.map((release, i) => (
              <Reveal
                key={release.version}
                delay={Math.min(i * 0.04, 0.24)}
                y={14}
              >
                <article
                  id={release.version}
                  className="space-y-3 border-t border-fd-border pt-6"
                >
                  <h2 className="font-display text-2xl font-semibold tracking-tight">
                    <span className="mr-3 font-mono text-xs tracking-widest text-fd-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {release.version}
                  </h2>
                  <ul className="list-disc space-y-2 pl-5 text-fd-muted-foreground">
                    {release.bullets.map((b) => (
                      <li
                        key={b}
                        className="leading-relaxed [&_strong]:text-fd-foreground"
                      >
                        {renderInlineMarkdown(b)}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </section>
        </main>
      </PageEnter>
    </HomeLayout>
  );
}
