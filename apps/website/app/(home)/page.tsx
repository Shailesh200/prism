import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { HomeHero } from "@/components/home-hero";
import { LandingChapter } from "@/components/landing-chapter";
import { EnvelopeTheater } from "@/components/envelope-theater";
import { GuardTheater } from "@/components/guard-theater";
import { PrepareTheater } from "@/components/prepare-theater";
import { SurfaceTicker } from "@/components/surface-ticker";
import { QuestionLed } from "@/components/question-led";
import { SurfacesStrip } from "@/components/surfaces-strip";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";
import { SITE_DESCRIPTION, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  description: SITE_DESCRIPTION,
  path: "/",
});

export default function HomePage() {
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <HomeHero />
        <SurfaceTicker />

        <LandingChapter
          index="Nº02 · Envelope"
          title="Every call leaves a receipt"
          body="Envelope is a local ledger of Prism tool calls: tool, counts, truncated, bytes. No prompts. No source. Never uploaded. `prism stats` shows bytes kept vs dump — an empty week is “no sessions,” never 0%."
          href="/docs/guides/envelope"
          cta="Envelope docs"
          reverse
        >
          <EnvelopeTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº03 · Prepare"
          title="Ask what to open. Do not dump the repo."
          body="One call before you edit: the files to open, helpers to reuse, three House Style exemplars, notes, and a work order. Paths and names only — never file bodies."
          href="/docs/guides/prepare-a-change"
          cta="Prepare a change"
        >
          <PrepareTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº04 · Guard"
          title="Read the 3% that can hurt"
          body="After a messy session, Guard ranks this session’s dirty files by blast risk. Pre-existing dirt stays out. Duplicates, orphans, and boundary crossings are flagged."
          href="/docs/guides/guard-a-session"
          cta="Guard a session"
          reverse
          className="bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))]"
        >
          <GuardTheater />
        </LandingChapter>

        <div className="border-t border-fd-border">
          <QuestionLed />
        </div>

        <SurfacesStrip />

        <section className="border-t border-fd-border px-6 py-20">
          <div className="mx-auto w-full max-w-5xl space-y-8">
            <Reveal>
              <div className="space-y-3">
                <p className="font-mono text-xs tracking-widest text-fd-primary">
                  Proof
                </p>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-fd-foreground md:text-3xl">
                  Fewer hops before an edit
                </h2>
                <p className="max-w-2xl text-fd-muted-foreground">
                  Five questions on five fixture repos, measured as tool-call
                  counts. Privacy is the default: the engine never phones home.
                </p>
                <div className="flex flex-wrap gap-4 pt-2 text-sm">
                  <Link href="/benchmarks" className="text-fd-primary">
                    Benchmarks →
                  </Link>
                  <Link href="/privacy" className="text-fd-primary">
                    Privacy →
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
