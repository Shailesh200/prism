import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { PageEnter } from "@/components/motion/PageEnter";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { SiteFooter } from "@/components/site-footer";
import { LandingChapter } from "@/components/landing-chapter";
import { SpectrumTheater } from "@/components/spectrum-theater";
import { IntelligenceTheater } from "@/components/intelligence-theater";
import { EnvelopeTheater } from "@/components/envelope-theater";
import { PrepareTheater } from "@/components/prepare-theater";
import { GuardTheater } from "@/components/guard-theater";
import { DispatchTheater } from "@/components/dispatch-theater";
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
  description:
    "Spectrum, Intelligence, Envelope, Prepare, Guard, and Dispatch — one local engine.",
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
              description="Spectrum is the map. Intelligence reads it. Envelope proves the chat stayed lean. Prepare says what to open. Guard says what to read. Dispatch is the teammate. Same engine. They cannot disagree."
            />
          </div>

          <LandingChapter
            id="playground"
            index="01 · Playground"
            title="Spectrum"
            body="Local, not hosted. Packages, clusters, blast on the repo you already have. The same map as the IDE — Console Iris no longer mounts it."
            href="/docs/start/playground"
            cta="Playground docs"
            note={
              <code className="block font-mono text-sm text-fd-primary">
                bun run playground
              </code>
            }
            className="bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))]"
          >
            <SpectrumTheater />
          </LandingChapter>

          <LandingChapter
            id="intelligence"
            index="02 · Intelligence"
            title="See the repo before you touch it"
            body="DNA, blast radius, and stack domains — the same Playground tabs as the IDE. Frontend, backend, DevOps, and the rest of the catalog, scored locally."
            href="/docs/guides/understand-a-repo"
            cta="Understand a repo"
            reverse
          >
            <IntelligenceTheater />
          </LandingChapter>

          <LandingChapter
            id="envelope"
            index="03 · Envelope"
            title="Every call leaves a receipt"
            body="Iris no longer mounts the map. It shows index facts plus Envelope: bytes kept vs dump, follow-through, truncated lists. The ledger never holds source, and it is never uploaded."
            href="/docs/guides/envelope-and-iris"
            cta="Envelope and Iris"
          >
            <EnvelopeTheater />
          </LandingChapter>

          <LandingChapter
            id="prepare"
            index="04 · Prepare"
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
            index="05 · Guard"
            title="Read the files that can hurt"
            body="guard_session ranks this session’s dirty files — working tree minus what you already had dirty. High blast first. Duplicates, orphans, boundary crossings flagged."
            href="/docs/guides/guard-a-session"
            cta="Guard a session"
          >
            <GuardTheater />
          </LandingChapter>

          <LandingChapter
            id="dispatch"
            index="06 · Dispatch"
            title="Watch the teammate"
            body="A local page at prismhq.localhost:17330. Checkout-first and uncommitted; a worktree when you ask. Prism runs this repository’s checks — or shows — if it has none. Finish is not land."
            href="/docs/guides/dispatch"
            cta="Dispatch docs"
            reverse
            note={
              <p className="font-mono text-sm text-fd-primary">
                prism init never asks for a key. No OAuth.
              </p>
            }
            className="bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))]"
          >
            <DispatchTheater />
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
