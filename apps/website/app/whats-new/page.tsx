import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { Shell } from "@/components/paper/shell";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "What's new",
  description:
    "Release notes live on the changelog. Highlight posts are listed here.",
  path: "/whats-new",
});

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
        .map((line) => line.split(":").map((part) => part.trim()))
        .filter((parts) => parts.length >= 2)
        .map(([key, ...rest]) => [
          key,
          rest.join(":").replace(/^["']|["']$/g, ""),
        ]),
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
  const posts = await loadPosts();
  return (
    <Shell>
      <section style={{ padding: "80px 0" }}>
        <div className="wrap">
          <div className="eyebrow">What&apos;s new</div>
          <h1 className="d1" style={{ margin: "18px 0" }}>
            Release notes.
          </h1>
          <p className="lede">
            The full list is the{" "}
            <Link href="/changelog">
              <u>changelog</u>
            </Link>
            . These posts expand a few releases.
          </p>
          <div className="grid2" style={{ marginTop: 36 }}>
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/whats-new/${post.slug}`}
                className="card"
                style={{ display: "block" }}
              >
                <h2 className="t">{post.title}</h2>
                <p>{post.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Shell>
  );
}
