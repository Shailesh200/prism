import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { PageEnter } from "@/components/motion/PageEnter";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { SiteFooter } from "@/components/site-footer";
import { LandingChapter } from "@/components/landing-chapter";
import { SpectrumTheater } from "@/components/spectrum-theater";
import { IntelligenceTheater } from "@/components/intelligence-theater";
import { DispatchTheater } from "@/components/dispatch-theater";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Products",
  description:
    "Playground, Intelligence, and Dispatch — three surfaces, one local engine.",
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
              description="Three surfaces. Playground is the map; Intelligence reads it; Dispatch is the teammate. Same engine. They cannot disagree."
            />
          </div>

          <LandingChapter
            id="playground"
            index="01 · Playground"
            title="Spectrum"
            body="Local, not hosted. The same map Iris shows in the Console — packages, clusters, blast on the repo you already have."
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
            id="dispatch"
            index="03 · Dispatch"
            title="Watch the teammate"
            body="A local page at prismhq.localhost:17330. Checkout-first and uncommitted; a worktree when you ask. Prism runs typecheck and tests. Finish is not land."
            href="/docs/guides/dispatch"
            cta="Dispatch docs"
            note={
              <p className="font-mono text-sm text-fd-primary">
                prism init never asks for a key. No OAuth.
              </p>
            }
            className="bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))]"
          >
            <DispatchTheater />
          </LandingChapter>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
