import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { PageEnter } from "@/components/motion/PageEnter";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { SiteFooter } from "@/components/site-footer";
import { LandingChapter } from "@/components/landing-chapter";
import { EnvelopeTheater } from "@/components/envelope-theater";
import { PrepareTheater } from "@/components/prepare-theater";
import { GuardTheater } from "@/components/guard-theater";
import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { pageMetadata } from "@/lib/seo";

const ALSO = [
  {
    href: "/docs/guides/findings",
    title: "Findings",
    body: "Unused exports, duplicates, wrappers. Resolved only after a re-scan drops the fingerprint.",
  },
  {
    href: "/docs/guides/remember-context",
    title: "Working set + Living AGENTS.md",
    body: "Restore the neighborhood after compaction. AGENTS.md lives in ~/.prism, never in git.",
  },
  {
    href: "/docs/guides/prepare-a-change",
    title: "Work orders",
    body: "In-scope, off-limits, needs-sign-off. Advisory unless an Accepted ADR arms the write veto.",
  },
] as const;

export const metadata = pageMetadata({
  title: "Products",
  description: "Envelope, Prepare, and Guard — one local engine.",
  path: "/products",
});

export default function ProductsPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="flex w-full flex-col">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <SectionIntro
              index="Nº PRODUCTS"
              title="Products"
              description="Prepare says what to open. Guard says what to read. Envelope proves the chat stayed lean. Same engine. They cannot disagree."
            />
          </div>

          <LandingChapter
            id="envelope"
            index="01 · Envelope"
            title="Every call leaves a receipt"
            body="A local ledger of every Prism tool call: bytes kept vs dump, follow-through, truncated lists. The ledger never holds source, and it is never uploaded."
            href="/docs/guides/envelope"
            cta="Envelope docs"
          >
            <EnvelopeTheater />
          </LandingChapter>

          <LandingChapter
            id="prepare"
            index="02 · Prepare"
            title="Ask what to open"
            body="prepare_change returns a pack, reuse hits, House Style, notes, and a work order — paths only. Ambiguous names come back as candidates. Vendor and generated paths stay off-limits."
            href="/docs/guides/prepare-a-change"
            cta="Prepare a change"
            reverse
            className="bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))]"
          >
            <PrepareTheater />
          </LandingChapter>

          <LandingChapter
            id="guard"
            index="03 · Guard"
            title="Read the files that can hurt"
            body="guard_session ranks this session’s dirty files — working tree minus what you already had dirty. High blast first. Duplicates, orphans, boundary crossings flagged."
            href="/docs/guides/guard-a-session"
            cta="Guard a session"
          >
            <GuardTheater />
          </LandingChapter>

          <section className="border-t border-fd-border px-6 py-20">
            <div className="mx-auto w-full max-w-5xl space-y-10">
              <Reveal>
                <div className="space-y-3">
                  <p className="font-mono text-xs tracking-widest text-fd-primary">
                    Also in this ship
                  </p>
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-fd-foreground md:text-3xl">
                    Findings, memory, and work orders
                  </h2>
                </div>
              </Reveal>
              <ul className="divide-y divide-fd-border border-y border-fd-border">
                {ALSO.map((item, i) => (
                  <Reveal key={item.title} delay={i * 0.06} y={14}>
                    <li>
                      <Link
                        href={item.href}
                        className="group flex flex-col gap-2 py-5 transition sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
                      >
                        <div className="flex items-baseline gap-4">
                          <span className="font-mono text-xs text-fd-primary">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="font-display text-lg font-medium text-fd-foreground group-hover:text-fd-primary md:text-xl">
                            {item.title}
                          </span>
                        </div>
                        <p className="max-w-md text-sm text-fd-muted-foreground sm:text-right">
                          {item.body}
                        </p>
                      </Link>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </div>
          </section>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
