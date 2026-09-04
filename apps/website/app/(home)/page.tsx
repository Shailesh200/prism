import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { HomeHero } from "@/components/home-hero";
import { TerminalDemo } from "@/components/terminal-demo";
import { QuestionLed } from "@/components/question-led";
import { SurfacesStrip } from "@/components/surfaces-strip";
import { McpInstallPanel } from "@/components/mcp-install-panel";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";

export default function HomePage() {
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <HomeHero />

        <section className="border-t border-fd-border bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))] px-6 py-20">
          <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <div className="space-y-4">
                <p className="font-mono text-xs tracking-widest text-fd-primary">
                  Nº02
                </p>
                <h2 className="font-display text-3xl font-semibold tracking-tight text-fd-foreground md:text-4xl">
                  Same answers in a terminal
                </h2>
                <p className="max-w-md text-fd-muted-foreground">
                  DNA and blast radius are structural — no model, no upload. Run
                  them from CI or a shell; the IDE and MCP surfaces use the same
                  engine.
                </p>
                <Link
                  href="/docs/start/install"
                  className="inline-block text-sm text-fd-primary"
                >
                  Install the CLI →
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.1} y={24}>
              <TerminalDemo />
            </Reveal>
          </div>
        </section>

        <div className="border-t border-fd-border">
          <QuestionLed />
        </div>

        <SurfacesStrip />

        <section className="border-t border-fd-border px-6 py-20">
          <div className="mx-auto w-full max-w-3xl space-y-8">
            <Reveal>
              <div className="space-y-3">
                <p className="font-mono text-xs tracking-widest text-fd-primary">
                  Nº05
                </p>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-fd-foreground md:text-3xl">
                  Connect it to your agent
                </h2>
                <p className="max-w-md text-fd-muted-foreground">
                  One config, then talk in plain language — you never type tool
                  names. Nothing leaves your machine.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1} y={20}>
              <McpInstallPanel />
            </Reveal>
          </div>
        </section>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
