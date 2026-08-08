import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import Link from "next/link";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIntro } from "@/components/motion/SectionIntro";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Install Prism as a CLI, IDE extension, MCP server, or playground.",
};

const PRODUCTS = [
  {
    title: "CLI",
    install: "npm install -g @repo-prism/cli",
    href: "/docs/cli/install",
    body: "Terminal and CI. Same Core as every other surface.",
  },
  {
    title: "VS Code & Cursor",
    install: "Install “Prism” from the marketplace",
    href: "/docs/ide/install",
    body: "Map, blast, health, and domains inside the editor.",
  },
  {
    title: "MCP server",
    install: "npx @repo-prism/mcp-server",
    href: "/docs/mcp/install",
    body: "Repository structure for AI agents, local-first.",
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
          <ul className="divide-y divide-fd-border border-y border-fd-border">
            {PRODUCTS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.05} y={14}>
                <li className="flex flex-col gap-3 py-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
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
              </Reveal>
            ))}
          </ul>
        </main>
      </PageEnter>
    </HomeLayout>
  );
}
