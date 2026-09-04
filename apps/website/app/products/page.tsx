import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import Link from "next/link";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { StaggerGrid } from "@/components/motion/StaggerGrid";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { McpInstallPanel } from "@/components/mcp-install-panel";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Install Prism as a CLI, IDE extension, MCP server, plugin pack, or playground.",
};

const PRODUCTS = [
  {
    title: "CLI",
    install: "npm install -g @repo-prism/cli",
    href: "/docs/start/install",
    body: "Terminal and CI. Same Core as every other surface.",
  },
  {
    title: "VS Code & Cursor",
    install: "Install “Prism” from the marketplace",
    href: "/docs/start/install",
    body: "Map, blast, health, and domains inside the editor.",
  },
  {
    title: "MCP server",
    install: "npx @repo-prism/mcp-server",
    href: "/docs/start/install",
    body: "Repository structure for AI agents, local-first.",
  },
  {
    title: "Plugin pack",
    install: "Install “Prism” from your editor's plugins",
    href: "/docs/start/install",
    body: "Skills that compose Prism's tools with the connectors you already have — review a PR with its blast radius, check what breaks before editing.",
  },
  {
    title: "Dispatch",
    install: "Say “start working on …” in chat",
    href: "/docs/guides/dispatch",
    body: "Hand work to a background teammate. It edits your own checkout by default; Prism runs the checks when it stops.",
  },
  {
    title: "Prism Console",
    install: "Runs itself — any Prism tool starts it",
    href: "/docs/guides/dispatch#local-workers",
    body: "A local page at prismhq.localhost:17330 listing every teammate across every repo, with live output and OS notifications.",
  },
  {
    title: "Core SDK",
    install: "npm install @repo-prism/core",
    href: "/admin/docs/core-sdk",
    body: "Programmatic access for custom surfaces.",
  },
  {
    title: "Playground",
    install: "bun run playground",
    href: "/docs/start/playground",
    body: "Local web UI over fixture maps or a live workspace.",
  },
];

export default function ProductsPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16">
          <SectionIntro
            index="Nº PRODUCTS"
            title="Products"
            description="Pick a surface. They share one engine and agree with each other."
          />
          <StaggerGrid items="li">
            <ul className="divide-y divide-fd-border border-y border-fd-border">
              {PRODUCTS.map((p, i) => (
                <li
                  key={p.title}
                  className="flex flex-col gap-3 py-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10"
                >
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-4">
                      <span className="font-mono text-xs text-fd-primary">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h2 className="font-display text-xl font-medium text-fd-foreground">
                        {p.title}
                      </h2>
                    </div>
                    <p className="max-w-md pl-8 text-sm text-fd-muted-foreground">
                      {p.body}
                    </p>
                    <code className="mt-1 block pl-8 font-mono text-sm text-fd-primary">
                      {p.install}
                    </code>
                  </div>
                  <Link
                    href={p.href}
                    className="shrink-0 pl-8 text-sm text-fd-primary sm:pl-0 sm:pt-1"
                  >
                    Docs →
                  </Link>
                </li>
              ))}
            </ul>
          </StaggerGrid>
          <Reveal y={14}>
            <section className="space-y-6 border-t border-fd-border pt-12">
              <h2 className="font-display text-xl font-medium text-fd-foreground">
                Connect the MCP server
              </h2>
              <McpInstallPanel />
            </section>
          </Reveal>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
