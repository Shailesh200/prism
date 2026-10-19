import type { ReactNode } from "react";
import Link from "next/link";
import { Callout } from "@/components/ui/callout";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Pill } from "@/components/ui/pill";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { SITE_CURRENT_RELEASE, type ChangelogRelease } from "@/lib/changelog";
import { legacyTag } from "@/lib/changelog-legacy";
import {
  changelogEntries,
  pageCount,
  pageHref,
  PER_PAGE,
  versionHref,
} from "@/lib/changelog-pages";
import { GITHUB } from "@/lib/github";
import { HashToPage } from "./hash-to-page";

/**
 * 2.0 items confirmed in source; CHANGELOG.md's 2.0.0 section says the same
 * in full, and /changelog/2-0-0 is the release post.
 */
const V2: Array<{ label: string; body: ReactNode }> = [
  {
    label: "Start",
    body: (
      <>
        <code>prism start</code> installs Prism for the agents it finds, indexes
        the repo, prints the top of the map and shows what to try.
      </>
    ),
  },
  {
    label: "Receipts",
    body: (
      <>
        The verdict comes first: SHIP, NOT PROVEN (with the cheapest command
        that would prove it) or NO-SHIP. Checks run your typecheck, lint and the
        tests the change reaches.
      </>
    ),
  },
  {
    label: "Prepare",
    body: (
      <>
        The automatic file list holds at most 3 files Prism is sure of, with
        nearby tests and one run command. Files that changed in the same commits
        are ranked into that list.
      </>
    ),
  },
  {
    label: "Review",
    body: (
      <>
        Review is <code>guard_session</code> with <code>review: true</code>.
        Findings say what, where, how to fix it, and the risk if you skip it.
      </>
    ),
  },
  {
    label: "Lenses",
    body: (
      <>
        Lenses are shared by every repository, with nine data-backed checks and
        custom trigger phrases.
      </>
    ),
  },
  {
    label: "Habits",
    body: (
      <>
        New <code>habits</code> tool and <code>prism habit</code> command for
        saved routines. Prism stores the steps; your agent runs them.
      </>
    ),
  },
  {
    label: "Strength",
    body: (
      <>
        <code>prism strength full|lite|off</code> sets how much the hooks do.
      </>
    ),
  },
  {
    label: "Map",
    body: (
      <>
        <code>graph</code> gains <code>map</code> and <code>symbol</code> modes.{" "}
        <code>prism graph map</code> prints a compact repo map.
      </>
    ),
  },
  {
    label: "Engine",
    body: (
      <>
        Blast radius works per symbol. Type-only imports no longer count as
        cycles.
      </>
    ),
  },
  {
    label: "Budgets",
    body: <>Every tool takes maxTokens (200–12,000).</>,
  },
  {
    label: "Tests",
    body: (
      <>
        <code>test_impact</code> returns a ready command for each package.
      </>
    ),
  },
  {
    label: "Install",
    body: (
      <>
        Install records what it writes; uninstall removes exactly that.
        Installing over 1.x removes 1.x data. Valid custom lenses and config
        keys are kept. After an upgrade, the next Claude Code session updates
        Prism&apos;s own hooks, keeps your other hooks and writes a backup.
      </>
    ),
  },
  {
    label: "CLI",
    body: (
      <>
        New <code>prism stats</code> and <code>prism doctor --fix</code>.
      </>
    ),
  },
  {
    label: "Skills",
    body: (
      <>
        One <code>prism</code> skill replaces five earlier ones:
        prism-review-pr, prism-safe-change, prism-onboard, prism-lens and
        prism-habits.
      </>
    ),
  },
  {
    label: "Removed",
    body: (
      <>
        The 1.x VS Code and Cursor extensions, app-shell, playground, Dispatch,
        and the 1.x tool names.
      </>
    ),
  },
];

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

/** One page of the changelog: up to PER_PAGE versions, newest first. */
export async function ChangelogView({ page }: { page: number }) {
  const entries = await changelogEntries();
  const pages = pageCount(entries.length);
  const shown = entries.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const showCurrent = shown[0]?.version === SITE_CURRENT_RELEASE.version;
  const history = shown.filter(
    (release) => release.version !== SITE_CURRENT_RELEASE.version,
  );
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
        {showCurrent ? (
          <section className="sec pb-10">
            <Container>
              <article
                id="2.0.0"
                className="cl-rel grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-rule py-11 md:grid-cols-[260px_minmax(0,1fr)] md:gap-10"
              >
                <div className="cl-meta">
                  <h2 className="d3">Prism 2.0.0</h2>
                  <p className="muted mt-2 mb-3">
                    Prepare, lens review and receipts
                  </p>
                  <Pill tone="ok">current</Pill>
                  <p className="mt-3">
                    <Link href="/changelog/2-0-0">
                      Read the 2.0 release notes
                    </Link>
                  </p>
                </div>
                <div>
                  {V2.map((item) => (
                    <div
                      key={item.label}
                      className="grid grid-cols-[minmax(0,1fr)] gap-2 border-b border-rule py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4"
                    >
                      <span className="font-mono text-[13.5px] text-ink3">
                        {item.label}
                      </span>
                      <span className="text-ink2">{item.body}</span>
                    </div>
                  ))}
                </div>
              </article>
            </Container>
          </section>
        ) : null}
        {history.length > 0 ? (
          <section className="sec border-t border-rule bg-paper2">
            <Container>
              <div className="pt-2 pb-4">
                <div className="eyebrow">Legacy</div>
                <h2 className="d2 mt-3 mb-3">1.x releases</h2>
                {showCurrent ? (
                  <Callout>
                    Prism 2.0 is a clean break. It removed the 1.x VS Code and
                    Cursor extensions, app-shell, playground, Dispatch, and the
                    1.x tool names and environment variables. The notes below
                    are the 1.x releases as written at the time.
                  </Callout>
                ) : null}
              </div>
              {history.map((release) => (
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
                    <Pill>Legacy 1.x</Pill>
                  </div>
                  <ReleaseBody release={release} legacy />
                </article>
              ))}
              <Pager page={page} pages={pages} />
            </Container>
          </section>
        ) : (
          <Container>
            <Pager page={page} pages={pages} />
          </Container>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
