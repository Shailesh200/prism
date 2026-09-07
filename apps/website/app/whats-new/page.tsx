import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import {
  parseChangelog,
  releaseChips,
  releaseDek,
  releaseTags,
  stripMd,
} from "@/lib/changelog";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { Globe, LayoutDashboard, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { StaggerGrid } from "@/components/motion/StaggerGrid";
import { SiteFooter } from "@/components/site-footer";
import { WhatsNewStill } from "@/components/whats-new-still";
import { ShipArchive } from "@/components/ship-archive";
import "./whats-new.css";

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

const FEATURE_CARDS: Array<{
  slug: string;
  kicker: string;
  Icon: LucideIcon;
}> = [
  { slug: "1-8-0-console", kicker: "FEAT_01 · Console", Icon: LayoutDashboard },
  { slug: "1-8-0-website", kicker: "FEAT_02 · Website", Icon: Globe },
  { slug: "1-8-0-mcp", kicker: "FEAT_03 · MCP", Icon: UsersRound },
];

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
  const featured = releases[0];
  const rest = featured ? releases.slice(1) : releases;
  const featurePosts = FEATURE_CARDS.flatMap((card) => {
    const post = posts.find((p) => p.slug === card.slug);
    return post ? [{ ...card, post }] : [];
  });
  const leadPost = featurePosts[0]?.post ?? posts[0] ?? null;
  const earlierNotes = posts.filter(
    (post) => !FEATURE_CARDS.some((card) => card.slug === post.slug),
  );

  const dek = featured
    ? featured.sections
        .slice(0, 2)
        .map((section) => stripMd(section.bullets[0] ?? ""))
        .filter(Boolean)
        .join(" ") || releaseDek(featured)
    : "";

  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="wn">
          <div className="wn__inner">
            <p className="wn-folio">
              <span>
                <strong>What&apos;s new</strong> — Prism Intelligence
              </span>
              {featured ? <span>Latest · {featured.version}</span> : null}
            </p>

            {featured ? (
              <article className="wn-spread" id={featured.version}>
                <h1 className="wn-spread__title">
                  {featured.version}
                  {featured.title ? ` — ${featured.title}` : ""}
                </h1>
                <div className="wn-spread__copy">
                  <p className="wn-spread__kicker">Feature</p>
                  <p className="wn-spread__dek">{dek}</p>
                  {leadPost ? (
                    <Link
                      href={`/whats-new/${leadPost.slug}`}
                      className="wn-spread__cta"
                    >
                      Read highlight post →
                    </Link>
                  ) : null}
                </div>
                <Reveal className="wn-spread__plate" y={24}>
                  <WhatsNewStill />
                </Reveal>
              </article>
            ) : (
              <h1 className="wn-spread__title">What&apos;s new</h1>
            )}

            {featurePosts.length > 0 ? (
              <section>
                <h2 className="wn-label">Feature highlights</h2>
                <StaggerGrid items="li">
                  <ul className="wn-feats">
                    {featurePosts.map(({ kicker, Icon, post }) => (
                      <li key={post.slug}>
                        <Link
                          href={`/whats-new/${post.slug}`}
                          className="wn-feat"
                        >
                          <span className="wn-feat__icon" aria-hidden>
                            <Icon size={16} strokeWidth={1.75} />
                          </span>
                          <span className="wn-feat__kicker">{kicker}</span>
                          <span className="wn-feat__title">{post.title}</span>
                          <p>{post.description}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </StaggerGrid>
              </section>
            ) : null}

            {earlierNotes.length > 0 ? (
              <section>
                <h2 className="wn-label">Earlier notes</h2>
                <StaggerGrid items="li">
                  <ul className="wn-feats wn-feats--notes">
                    {earlierNotes.map((post) => (
                      <li key={post.slug}>
                        <Link
                          href={`/whats-new/${post.slug}`}
                          className="wn-feat"
                        >
                          {post.version ? (
                            <span className="wn-feat__kicker">
                              {post.version}
                            </span>
                          ) : null}
                          <span className="wn-feat__title">{post.title}</span>
                          <p>{post.description}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </StaggerGrid>
              </section>
            ) : null}

            <ShipArchive
              entries={rest.map((release) => ({
                version: release.version,
                title: release.title,
                dek: releaseDek(release),
                chips: releaseChips(release),
                tags: releaseTags(release),
              }))}
            />
          </div>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
