import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { CopyInstall } from "@/components/copy-install";
import { ChartHeroVisual } from "@/components/chart-hero-visual";
import { TerminalDemo } from "@/components/terminal-demo";
import { QuestionLed } from "@/components/question-led";
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <HomeLayout {...baseOptions()}>
      {/* 1. Chart hero — brand + map plane */}
      <section className="relative grid min-h-[85vh] w-full grid-cols-1 overflow-hidden lg:grid-cols-2">
        <div className="relative z-10 flex flex-col justify-center gap-8 px-6 py-16 md:px-12 lg:py-24">
          <Image
            src="/brand/prism-mark.png"
            alt=""
            width={56}
            height={56}
            className="rounded-lg"
            priority
          />
          <div className="space-y-5">
            <h1 className="text-5xl font-semibold tracking-tight text-fd-foreground md:text-7xl">
              Prism
            </h1>
            <p className="max-w-md text-lg text-fd-muted-foreground md:text-xl">
              Turn a repository into terrain you can navigate.
            </p>
            <p className="max-w-md text-sm font-medium tracking-wide text-fd-foreground">
              Local-first · No AI needed · No account
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs/start/get-started"
              className="rounded-md bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground"
            >
              Get started
            </Link>
            <Link
              href="/docs"
              className="rounded-md border border-fd-border px-4 py-2.5 text-sm text-fd-foreground"
            >
              Read the docs
            </Link>
          </div>
          <div className="max-w-xl">
            <CopyInstall />
          </div>
        </div>
        <div className="relative min-h-[300px] border-t border-fd-border lg:min-h-0 lg:border-l lg:border-t-0">
          <ChartHeroVisual />
        </div>
      </section>

      {/* 2. Terminal-first */}
      <section className="border-t border-fd-border bg-[color-mix(in_oklab,var(--prism-canvas)_80%,var(--prism-panel))] px-6 py-20">
        <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold tracking-tight text-fd-foreground md:text-4xl">
              Same answers in a terminal
            </h2>
            <p className="max-w-md text-fd-muted-foreground">
              DNA and blast radius are structural — no model, no upload. Run
              them from CI or a shell; the IDE and MCP surfaces use the same
              engine.
            </p>
            <Link
              href="/docs/cli/install"
              className="inline-block text-sm text-fd-primary"
            >
              Install the CLI →
            </Link>
          </div>
          <TerminalDemo />
        </div>
      </section>

      {/* 3. Question-led */}
      <div className="border-t border-fd-border">
        <QuestionLed />
      </div>

      <section className="border-t border-fd-border px-6 py-20">
        <div className="mx-auto w-full max-w-5xl space-y-8">
          <h2 className="text-2xl font-semibold tracking-tight text-fd-foreground">
            One engine, four surfaces
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/docs/cli/install",
                title: "CLI",
                body: "prism commands for terminals and CI.",
              },
              {
                href: "/docs/ide/install",
                title: "IDE extension",
                body: "VS Code and Cursor — same Map and blast UI.",
              },
              {
                href: "/docs/mcp/install",
                title: "AI agents (MCP)",
                body: "Structure for agents — Prism does not write code.",
              },
              {
                href: "/docs/start/playground",
                title: "Playground",
                body: "Local web UI over the same Core SDK.",
              },
            ].map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="rounded-xl border border-fd-border bg-fd-card p-5 transition hover:border-fd-primary"
              >
                <div className="font-medium text-fd-foreground">{s.title}</div>
                <p className="mt-2 text-sm text-fd-muted-foreground">
                  {s.body}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </HomeLayout>
  );
}
