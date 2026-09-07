import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { HomeHero } from "@/components/home-hero";
import { LandingChapter } from "@/components/landing-chapter";
import { DispatchTheater } from "@/components/dispatch-theater";
import { IntelligenceTheater } from "@/components/intelligence-theater";
import { IrisTheater } from "@/components/iris-theater";
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
          body="Iris is the index, the graphs, DNA, landmarks, health, and memories. It speaks like infrastructure — never first person, never an avatar. Spectrum is the map it already has."
          href="/docs"
          cta="How the index works"
          className="bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))]"
        >
          <IrisTheater />
        </LandingChapter>

        <LandingChapter
          index="Nº05 · Spectrum"
          title="The map Iris already has"
          body="Spectrum is the repository map — Playground, Console, and the IDE share the same artifact. Packages, clusters, blast. Local. Zero network calls."
          href="/docs/start/playground"
          cta="Playground docs"
          reverse
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
