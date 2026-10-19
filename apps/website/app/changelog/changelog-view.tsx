import Link from "next/link";
import { Callout } from "@/components/ui/callout";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Pill } from "@/components/ui/pill";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import type { ChangelogRelease } from "@/lib/changelog";
import { legacyTag } from "@/lib/changelog-legacy";
import {
  changelogEntries,
  pageCount,
  pageHref,
  PER_PAGE,
  versionHref,
} from "@/lib/changelog-pages";
import { formatPublished, publishedTimes } from "@/lib/release-times";
import { GITHUB } from "@/lib/github";
import { HashToPage } from "./hash-to-page";

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i}>{part.slice(1, -1)}</code>;
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          return (
            <a key={i} href={repoHref(link[2])}>
              {link[1]}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** Prose before the first ### heading. Bullets stay in the lists below. */
function releaseLead(release: ChangelogRelease): string {
  const lines: string[] = [];
  for (const line of release.body.split("\n")) {
    if (/^###\s+/.test(line)) break;
    const trimmed = line.trim();
    // Indented lines continue the bullet above them; the parser folds them in.
    if (!trimmed || trimmed.startsWith("- ") || /^[ \t]+\S/.test(line)) {
      continue;
    }
    lines.push(trimmed);
  }
  return lines.join(" ");
}

/** 1.x surfaces that Prism 2.0 removed; their changelog sections are tagged and dimmed. */
const REMOVED_IN_2 = new Set([
  "Console",
  "Dispatch",
  "Spectrum",
  "Website",
  "IDE",
]);

function ReleaseBody({
  release,
  legacy,
}: {
  release: ChangelogRelease;
  legacy?: boolean;
}) {
  const lead = releaseLead(release);
  const sections =
    release.sections.length > 0
      ? release.sections
      : release.bullets.length > 0
        ? [{ title: "", bullets: release.bullets }]
        : [];
  // Where each section's bullets start in the release, for the per-bullet 1.x tags.
  const starts = sections.map((_, s) =>
    sections.slice(0, s).reduce((n, x) => n + x.bullets.length, 0),
  );
  return (
    <div className="text-ink2">
      {lead ? (
        <p className="mb-4">
          <Rich text={lead} />
        </p>
      ) : null}
      {sections.map((section, s) => {
        const removed = Boolean(legacy && REMOVED_IN_2.has(section.title));
        return (
          <div key={section.title || "notes"} className="mb-6">
            {section.title ? (
              removed ? (
                <h3 className="t mb-2">
                  {section.title} <Pill tone="bad">Removed in 2.0</Pill>
                </h3>
              ) : (
                <h3 className="t mb-2">{section.title}</h3>
              )
            ) : null}
            {section.intro?.split(/\n\n+/).map((para, i) => (
              <p
                key={`${section.title}-p-${i}`}
                className={removed ? "mb-4 text-ink3" : "mb-4"}
              >
                <Rich text={para} />
              </p>
            ))}
            {section.bullets.length > 0 ? (
              <ul className="list-disc space-y-2 pl-5">
                {section.bullets.map((bullet, i) => {
                  const tag = legacy
                    ? legacyTag(release.version, starts[s] + i)
                    : undefined;
                  return (
                    <li
                      key={`${section.title}-${i}`}
                      className={
                        removed || tag === "removed" ? "text-ink3" : undefined
                      }
                    >
                      {tag === "removed" ? (
                        <Pill tone="bad">Removed in 2.0</Pill>
                      ) : tag === "changed" ? (
                        <Pill>Changed in 2.0</Pill>
                      ) : null}
                      <Rich text={bullet} />
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** CHANGELOG.md links are relative to the repo root; point them at GitHub. */
function repoHref(href: string): string {
  return href.startsWith("./") ? `${GITHUB}/blob/main/${href.slice(2)}` : href;
}

function Pager({ page, pages }: { page: number; pages: number }) {
  if (pages < 2) return null;
  return (
    <nav className="cl-pager" aria-label="Changelog pages">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} rel="prev">
          ← Newer
        </Link>
      ) : (
        <span aria-disabled="true">← Newer</span>
      )}
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <Link
          key={n}
          href={pageHref(n)}
          aria-current={n === page ? "page" : undefined}
        >
          {n}
        </Link>
      ))}
      {page < pages ? (
        <Link href={pageHref(page + 1)} rel="next">
          Older →
        </Link>
      ) : (
        <span aria-disabled="true">Older →</span>
      )}
    </nav>
  );
}

function isLegacy(version: string): boolean {
  return version.startsWith("1.");
}

function PublishedAt({ at }: { at: string | undefined }) {
  if (!at) return null;
  const label = formatPublished(at);
  if (!label) return null;
  return (
    <time className="muted mt-2 mb-3 block text-[14px]" dateTime={at}>
      {label}
    </time>
  );
}

/** One page of the changelog: up to PER_PAGE versions, newest first. */
export async function ChangelogView({ page }: { page: number }) {
  const [entries, times] = await Promise.all([
    changelogEntries(),
    publishedTimes(),
  ]);
  const pages = pageCount(entries.length);
  const shown = entries.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const current = page === 1 ? shown[0] : undefined;
  const older = shown.filter((release) => release !== current);
  const recent = older.filter((release) => !isLegacy(release.version));
  const legacy = older.filter((release) => isLegacy(release.version));
  const versions = entries.map((release) => release.version);
  // A #version link that lands on the wrong page moves to the right one.
  const elsewhere = Object.fromEntries(
    entries
      .filter((release) => !shown.includes(release))
      .map((release) => [
        release.version,
        versionHref(release.version, versions),
      ]),
  );

  return (
    <>
      <SiteNav />
      <HashToPage targets={elsewhere} />
      <main>
        <PageHero
          eyebrow="Changelog"
          title={
            <>
              What’s <em>new.</em>
            </>
          }
          lede={
            page > 1
              ? `Older releases, page ${page} of ${pages}.`
              : "Changes to the CLI, the MCP server and the hooks."
          }
        />
        {current ? (
          <section className="sec pb-10">
            <Container>
              <article
                id={current.version}
                className="cl-rel grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-rule py-11 md:grid-cols-[260px_minmax(0,1fr)] md:gap-10"
              >
                <div className="cl-meta">
                  <h2 className="d3">Prism {current.version}</h2>
                  {current.title ? (
                    <p className="muted mt-2 mb-3">{current.title}</p>
                  ) : null}
                  <PublishedAt at={times[current.version]} />
                  <Pill tone="ok">current</Pill>
                  {current.version === "2.0.0" ? (
                    <p className="mt-3">
                      <Link href="/changelog/2-0-0">
                        Read the 2.0 release notes
                      </Link>
                    </p>
                  ) : null}
                </div>
                <ReleaseBody release={current} />
              </article>
            </Container>
          </section>
        ) : null}
        {recent.length > 0 ? (
          <section className="sec border-t border-rule">
            <Container>
              {recent.map((release) => (
                <article
                  key={release.version}
                  id={release.version}
                  className="cl-rel grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-rule py-9 md:grid-cols-[260px_minmax(0,1fr)] md:gap-10"
                >
                  <div className="cl-meta">
                    <h2 className="d3 text-[28px]">{release.version}</h2>
                    {release.title ? (
                      <p className="muted mt-2 mb-3 text-[15px]">
                        {release.title}
                      </p>
                    ) : null}
                    <PublishedAt at={times[release.version]} />
                  </div>
                  <ReleaseBody release={release} />
                </article>
              ))}
              {legacy.length === 0 ? <Pager page={page} pages={pages} /> : null}
            </Container>
          </section>
        ) : null}
        {legacy.length > 0 ? (
          <section className="sec border-t border-rule bg-paper2">
            <Container>
              <div className="pt-2 pb-4">
                <div className="eyebrow">Legacy</div>
                <h2 className="d2 mt-3 mb-3">1.x releases</h2>
                {current ? (
                  <Callout>
                    Prism 2.0 is a clean break. It removed the 1.x VS Code and
                    Cursor extensions, app-shell, playground, Dispatch, and the
                    1.x tool names and environment variables. The notes below
                    are the 1.x releases as written at the time.
                  </Callout>
                ) : null}
              </div>
              {legacy.map((release) => (
                <article
                  key={release.version}
                  id={release.version}
                  className="cl-rel grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-rule py-9 md:grid-cols-[260px_minmax(0,1fr)] md:gap-10"
                >
                  <div className="cl-meta">
                    <h2 className="d3 text-[28px]">{release.version}</h2>
                    {release.title ? (
                      <p className="muted mt-2 mb-3 text-[15px]">
                        {release.title}
                      </p>
                    ) : null}
                    <PublishedAt at={times[release.version]} />
                    <Pill>Legacy 1.x</Pill>
                  </div>
                  <ReleaseBody release={release} legacy />
                </article>
              ))}
              <Pager page={page} pages={pages} />
            </Container>
          </section>
        ) : recent.length === 0 ? (
          <Container>
            <Pager page={page} pages={pages} />
          </Container>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
