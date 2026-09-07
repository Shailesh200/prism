import type { ReactNode } from "react";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import Link from "next/link";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { CopyCommand } from "@/components/copy-command";
import { CopyInstall } from "@/components/copy-install";
import { McpInstallPanel } from "@/components/mcp-install-panel";
import { SiteFooter } from "@/components/site-footer";
import { PRISM_TOOL_COUNT } from "@/lib/mcp-install";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Install",
  description:
    "Node 26+, pick a surface, confirm it works. prism init never asks for a key.",
  path: "/install",
});

const SURFACES = [
  {
    title: "CLI",
    install: "npx -y @repo-prism/cli doctor",
    href: "/docs/start/install",
    body: "Terminal and CI. Same Core as every other surface.",
  },
  {
    title: "VS Code & Cursor",
    install: "Marketplace: prismhq.repo-prism",
    href: "/docs/start/install",
    body: "Map, blast, health, and the Console inside the editor.",
  },
  {
    title: "MCP server",
    install: "npx -y --prefer-online @repo-prism/mcp-server@latest",
    href: "/docs/start/install",
    body: `${PRISM_TOOL_COUNT} structural tools for agents, local-first.`,
  },
  {
    title: "Plugin pack",
    install: "Install “Prism” from your editor's plugins",
    href: "/docs/start/install",
    body: "Skills that compose Prism's tools with the connectors you already have.",
  },
  {
    title: "Core SDK",
    install: "npm install @repo-prism/core",
    href: "/admin/docs/core-sdk",
    body: "Programmatic access for custom surfaces.",
  },
];

const CONFIRM = [
  {
    surface: "CLI",
    see: "doctor prints a workspace path; dna prints a report",
  },
  {
    surface: "IDE",
    see: "Prism panel opens after indexing",
  },
  {
    surface: "MCP",
    see: `${PRISM_TOOL_COUNT} tools listed; the agent answers with repository structure`,
  },
];

export default function InstallPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-16 px-6 py-16">
          <SectionIntro
            index="Nº INSTALL"
            title="Install Prism"
            description="About five minutes. One engine behind CLI, IDE, and MCP. You do not need to clone this repo."
          />

          <Reveal>
            <ol className="relative space-y-12 border-l border-fd-border pl-8">
              <WizardStep n="01" title="Prerequisites">
                <ul className="space-y-3 text-sm text-fd-muted-foreground">
                  <li>
                    <strong className="text-fd-foreground">Node.js 26+</strong>{" "}
                    — <code className="text-fd-primary">node -v</code> should
                    start with <code className="text-fd-primary">v26</code>.
                  </li>
                  <li>
                    <strong className="text-fd-foreground">
                      A TypeScript / JavaScript folder
                    </strong>{" "}
                    — open or <code className="text-fd-primary">cd</code> into
                    it.
                  </li>
                  <li>
                    <strong className="text-fd-foreground">Git</strong> is
                    recommended (Dispatch and worktrees) but not required for
                    analysis.
                  </li>
                </ul>
              </WizardStep>

              <WizardStep n="02" title="Pick a surface">
                <p className="mb-4 text-sm text-fd-muted-foreground">
                  Add the others later — they share the same local index.
                </p>
                <CopyInstall />
                <div className="mt-6 space-y-3 text-sm text-fd-muted-foreground">
                  <p>
                    IDE extension id{" "}
                    <code className="text-fd-primary">prismhq.repo-prism</code>.
                  </p>
                  <p>
                    MCP:{" "}
                    <code className="text-fd-primary">
                      npx -y --prefer-online @repo-prism/mcp-server@latest
                    </code>
                  </p>
                </div>
              </WizardStep>

              <WizardStep n="03" title="prism init">
                <p className="text-sm leading-relaxed text-fd-muted-foreground">
                  In chat, say{" "}
                  <strong className="text-fd-foreground">prism init</strong>.
                  The worker matches the host. It never asks you to paste an API
                  key. If Cursor shows a card titled “Authenticating prism…”
                  with Skip, that is host tool-approval — click Skip, then retry
                  init.
                </p>
              </WizardStep>

              <WizardStep n="04" title="Confirm it works">
                <div className="overflow-x-auto rounded-lg border border-fd-border">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-fd-border bg-fd-card">
                      <tr>
                        <th className="px-4 py-3 font-medium">Surface</th>
                        <th className="px-4 py-3 font-medium">
                          You should see
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {CONFIRM.map((row) => (
                        <tr
                          key={row.surface}
                          className="border-b border-fd-border last:border-0"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-fd-primary">
                            {row.surface}
                          </td>
                          <td className="px-4 py-3 text-fd-muted-foreground">
                            {row.see}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </WizardStep>

              <WizardStep n="05" title="What Prism writes">
                <p className="mb-3 text-sm text-fd-muted-foreground">
                  Derived cache. Let Prism add{" "}
                  <code className="text-fd-primary">.prism/</code> to{" "}
                  <code className="text-fd-primary">.gitignore</code> when
                  offered — including{" "}
                  <code className="text-fd-primary">dispatch/</code>.
                </p>
                <CopyCommand
                  command="npx -y @repo-prism/cli doctor"
                  trackTarget="cli"
                />
              </WizardStep>
            </ol>
          </Reveal>

          <Reveal>
            <section className="space-y-6 border-t border-fd-border pt-12">
              <h2 className="font-display text-xl font-medium text-fd-foreground">
                Surfaces
              </h2>
              <p className="max-w-md text-sm text-fd-muted-foreground">
                Compact install paths. Same engine.
              </p>
              <ul className="divide-y divide-fd-border border-y border-fd-border">
                {SURFACES.map((p, i) => (
                  <li
                    key={p.title}
                    className="flex flex-col gap-3 py-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10"
                  >
                    <div className="space-y-2">
                      <div className="flex items-baseline gap-4">
                        <span className="font-mono text-xs text-fd-primary">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3 className="font-display text-xl font-medium text-fd-foreground">
                          {p.title}
                        </h3>
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
                      Guide →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>

          <Reveal>
            <section className="space-y-6 border-t border-fd-border pt-12">
              <h2 className="font-display text-xl font-medium text-fd-foreground">
                MCP one-click
              </h2>
              <McpInstallPanel />
            </section>
          </Reveal>

          <Reveal>
            <p className="text-sm text-fd-muted-foreground">
              Next:{" "}
              <Link href="/docs/start/quickstart" className="text-fd-primary">
                Quickstart
              </Link>
              {" · "}
              <Link href="/docs/usage" className="text-fd-primary">
                Usage
              </Link>
              {" · "}
              <Link href="/docs/guides/dispatch" className="text-fd-primary">
                Dispatch
              </Link>
              {" · "}
              <Link href="/docs/start/install" className="text-fd-primary">
                Full install guide
              </Link>
            </p>
          </Reveal>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}

function WizardStep({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <span className="absolute -left-8 top-0 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-fd-border bg-fd-background font-mono text-[10px] text-fd-primary">
        {n}
      </span>
      <h2 className="font-display text-xl font-medium text-fd-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </li>
  );
}
