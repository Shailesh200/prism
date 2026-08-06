import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import Link from "next/link";
import type { Metadata } from "next";

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
    install: "Install “Repo Prism” from the marketplace",
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
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16">
        <header className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">Products</h1>
          <p className="max-w-2xl text-fd-muted-foreground">
            Pick a surface. They share one engine and agree with each other.
          </p>
        </header>
        <div className="grid gap-4">
          {PRODUCTS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-fd-border p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-xl font-medium">{p.title}</h2>
                <Link href={p.href} className="text-sm text-fd-primary">
                  Docs →
                </Link>
              </div>
              <p className="mt-2 text-sm text-fd-muted-foreground">{p.body}</p>
              <code className="mt-4 block font-mono text-sm text-fd-primary">
                {p.install}
              </code>
            </div>
          ))}
        </div>
      </main>
    </HomeLayout>
  );
}
