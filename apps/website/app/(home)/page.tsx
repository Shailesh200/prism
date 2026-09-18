import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { HomeHero } from "@/components/home-hero";
import { LandingChapter } from "@/components/landing-chapter";
import { DispatchTheater } from "@/components/dispatch-theater";
import { EnvelopeTheater } from "@/components/envelope-theater";
import { GuardTheater } from "@/components/guard-theater";
import { IntelligenceTheater } from "@/components/intelligence-theater";
import { IrisTheater } from "@/components/iris-theater";
import { PrepareTheater } from "@/components/prepare-theater";
import { SpectrumTheater } from "@/components/spectrum-theater";
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
          index="Nº02 · Dispatch"
          title="Hand the change to a teammate"
          body="Dispatch is not a second model. It is the agent already in your editor — any MCP host, any agentic platform — plus Prism checks, watched from a local Console. Checkout-first. Finish is not land."
          href="/docs/guides/dispatch"
          cta="Dispatch docs"
        >
          <DispatchTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº03 · Intelligence"
          title="See the repo before you touch it"
          body="DNA, blast radius, and stack domains — the same Playground tabs as the IDE. Frontend, backend, DevOps, and the rest of the catalog, scored locally."
          href="/docs/guides/understand-a-repo"
          cta="Understand a repo"
          reverse
        >
          <IntelligenceTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº04 · Iris"
          title="Iris is the aperture"
          body="Iris is the index, the graphs, DNA, landmarks, health, and memories. Console Iris shows those facts plus Envelope — not the map. It speaks like infrastructure — never first person, never an avatar."
          href="/docs/guides/envelope-and-iris"
          cta="Envelope and Iris"
          className="bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))]"
        >
          <IrisTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº05 · Envelope"
          title="Every call leaves a receipt"
          body="Envelope is a local ledger of Intelligence calls: tool, counts, truncated, bytes. No prompts. No source. Never uploaded. Iris shows bytes kept vs dump — an empty week is “no sessions,” never 0%."
          href="/docs/guides/envelope-and-iris"
          cta="Envelope docs"
          reverse
        >
          <EnvelopeTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº06 · Prepare"
          title="Ask what to open. Do not dump the repo."
          body="One call before you edit: the files to open, helpers to reuse, three House Style exemplars, notes, and a work order. Paths and names only — never file bodies."
          href="/docs/guides/prepare-a-change"
          cta="Prepare a change"
        >
          <PrepareTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº07 · Guard"
          title="Read the 3% that can hurt"
          body="After a messy session, Guard ranks this session’s dirty files by blast risk. Pre-existing dirt stays out. Duplicates, orphans, and boundary crossings are flagged."
          href="/docs/guides/guard-a-session"
          cta="Guard a session"
          reverse
          className="bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))]"
        >
          <GuardTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº08 · Spectrum"
          title="The map Iris already has"
          body="Spectrum is the repository map — Playground, Console, and the IDE share the same artifact. Packages, clusters, blast. Local. Zero network calls. Console Iris no longer mounts this map."
          href="/docs/start/playground"
          cta="Playground docs"
        >
          <SpectrumTheater />
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
                  Six questions on five fixture repos, measured as tool-call
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
