import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { parseChangelog } from "@/lib/changelog";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { StaggerGrid } from "@/components/motion/StaggerGrid";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { SiteFooter } from "@/components/site-footer";

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
  return posts.toSorted(
    (a, b) =>
      (b.version ?? "").localeCompare(a.version ?? "") ||
      a.slug.localeCompare(b.slug),
  );
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
              <StaggerGrid items="li">
                <ul className="divide-y divide-fd-border border-y border-fd-border">
                  {posts.map((post) => (
                    <li key={post.slug}>
                      <Link
                        href={`/whats-new/${post.slug}`}
                        className="block py-5 transition hover:text-fd-primary"
                      >
                        <div className="font-display font-medium text-fd-foreground">
                          {post.title}
                        </div>
                        <p className="mt-1 text-sm text-fd-muted-foreground">
                          {post.description}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </StaggerGrid>
            </section>
          ) : null}

          {/*
            One budgeted stagger rather than a Reveal per release. The
            changelog grows every ship, so a per-item delay would either creep
            past the reader or need the clamp it used to carry.
          */}
          <StaggerGrid items="article" className="space-y-8">
            {releases.map((release, i) => (
              <article
                key={release.version}
                className="space-y-3 border-t border-fd-border pt-6"
              >
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  <span className="mr-3 font-mono text-xs tracking-widest text-fd-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {release.version}
                  {release.title ? (
                    <span className="mt-1 block font-sans text-base font-medium text-fd-muted-foreground">
                      {release.title}
                    </span>
                  ) : null}
                </h2>
                {release.sections.length > 0 ? (
                  <div className="space-y-5">
                    {release.sections.map((section) => (
                      <div key={section.title} className="space-y-2">
                        <h3 className="font-mono text-xs tracking-widest text-fd-primary">
                          {section.title}
                        </h3>
                        <ul className="list-disc space-y-2 pl-5 text-fd-muted-foreground">
                          {section.bullets.map((b) => (
                            <li key={b} className="leading-relaxed">
                              {b.replace(/\*\*/g, "")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="list-disc space-y-2 pl-5 text-fd-muted-foreground">
                    {release.bullets.map((b) => (
                      <li key={b} className="leading-relaxed">
                        {b.replace(/\*\*/g, "")}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </StaggerGrid>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
