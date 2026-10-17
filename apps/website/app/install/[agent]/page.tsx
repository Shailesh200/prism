import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AgentLogo } from "@/components/ui/agent-logo";
import { Button } from "@/components/ui/button";
import { Command } from "@/components/ui/command";
import { ConfigBlock } from "@/components/ui/config-block";
import { Container } from "@/components/ui/container";
import { cx } from "@/components/ui/cx";
import { PageHero } from "@/components/ui/page-hero";
import { Table } from "@/components/ui/table";
import { Ln } from "@/components/ui/term";
import { Window } from "@/components/ui/window";
import {
  HabitPair,
  PrepareDemo,
  ReviewDemo,
  SafeDeleteDemo,
} from "@/components/site/demos";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { AGENTS, type AgentSlug, agentBySlug } from "@/lib/agents";
import {
  PRISM_CODEX_TOML,
  PRISM_CURSOR_INSTALL_URL,
  PRISM_MCP_JSON_STRING,
  PRISM_OPENCODE_JSON_STRING,
  PRISM_RECEIPT_CONFIG,
} from "@/lib/mcp-install";
import { installLinkAttrs } from "@/lib/pulse";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { PRISM_VERSION } from "@/lib/version";
import { JsonLd } from "@/components/json-ld";

export const dynamicParams = false;

export function generateStaticParams() {
  return AGENTS.map((a) => ({ agent: a.slug }));
}

type Props = { params: Promise<{ agent: string }> };

export async function generateMetadata({ params }: Props) {
  const agent = agentBySlug((await params).agent);
  if (!agent) return {};
  return pageMetadata({
    title: `Install for ${agent.name}`,
    description: agent.lede,
    path: `/install/${agent.slug}`,
  });
}

/** What each agent page shows working, reusing the product demos. */
const DEMO: Record<AgentSlug, ReactNode> = {
  "claude-code": <PrepareDemo />,
  cursor: (
    <HabitPair
      habit={{
        name: "start my day",
        steps: [
          "github: list my open PRs and review requests",
          "linear: my in-progress issues",
        ],
        output: "standup",
        agent: "Cursor",
        reply: "Standup: 3 open PRs, 1 review request, 2 issues in progress.",
      }}
    />
  ),
  codex: <SafeDeleteDemo />,
  opencode: <ReviewDemo />,
};

const CONFIG: Record<AgentSlug, string> = {
  "claude-code": PRISM_MCP_JSON_STRING,
  cursor: PRISM_MCP_JSON_STRING,
  codex: PRISM_CODEX_TOML,
  opencode: PRISM_OPENCODE_JSON_STRING,
};

export default async function AgentInstallPage({ params }: Props) {
  const agent = agentBySlug((await params).agent);
  if (!agent) notFound();
  const extra =
    agent.slug === "claude-code"
      ? "the hooks and skill"
      : agent.slug === "opencode"
        ? "the plugin and rule"
        : "the rule";
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Install", path: "/install" },
          { name: agent.name, path: `/install/${agent.slug}` },
        ])}
      />
      <SiteNav />
      <nav aria-label="Agents" className="border-b border-rule bg-paper2">
        <Container className="subnav-scroll flex h-[52px] items-center gap-1 overflow-x-auto text-[15px]">
          <Link
            href="/install"
            className="mr-3 shrink-0 whitespace-nowrap text-ink3"
          >
            ← Install
          </Link>
          {AGENTS.map((a) => (
            <Link
              key={a.slug}
              href={`/install/${a.slug}`}
              aria-current={a.slug === agent.slug ? "page" : undefined}
              className={cx(
                "inline-flex shrink-0 items-center gap-2 rounded-pill px-3 py-1.5 whitespace-nowrap max-sm:min-h-10",
                a.slug === agent.slug ? "bg-ink text-paper" : "text-ink2",
              )}
            >
              <AgentLogo slug={a.slug} size={15} />
              {a.name}
            </Link>
          ))}
        </Container>
      </nav>
      <main>
        <PageHero
          eyebrow={`Install · ${agent.name}`}
          title={
            <>
              <AgentLogo slug={agent.slug} size={44} label /> Prism for{" "}
              <em>{agent.name}.</em>
            </>
          }
          lede={agent.lede}
          actions={
            <div className="grid w-full gap-4">
              <Command cmd="npm install -g @repo-prism/cli" />
              <Command cmd={`prism install ${agent.client}`} />
              {agent.notes && (
                <Window title="~/northwind">
                  <Ln>
                    Prism {PRISM_VERSION} installed for {agent.name}.
                  </Ln>
                  {agent.notes.map((n) => (
                    <Ln key={n}>{n}</Ln>
                  ))}
                </Window>
              )}
            </div>
          }
          aside={DEMO[agent.slug]}
        />

        <section className="sec">
          <Container className="setup">
            <div>
              <div className="eyebrow">By hand</div>
              <h2 className="d3 mt-3 mb-3.5">
                Or add the MCP server yourself.
              </h2>
              <p className="lede text-lg">
                Paste this into {agent.name}’s MCP config. It starts the
                published Prism server with <code>npx</code>. By hand you get
                the MCP tools, not {extra}.
              </p>
              <p className="mt-4 text-ink2">
                Without hooks, turn on the <code>receipt</code> tool so the
                agent can ask for a receipt before it says it is done.
              </p>
            </div>
            <div className="grid min-w-0 gap-5">
              <ConfigBlock
                lang={agent.config.lang}
                path={agent.config.path}
                text={CONFIG[agent.slug]}
                footer={agent.config.projectHint}
              />
              {agent.slug === "cursor" ? (
                <div className="grid justify-items-start gap-2">
                  <Button
                    href={PRISM_CURSOR_INSTALL_URL}
                    {...installLinkAttrs(PRISM_CURSOR_INSTALL_URL)}
                  >
                    Add to Cursor
                  </Button>
                  <p className="text-[15px] text-ink3">
                    Opens Cursor and asks before it adds the server. For the
                    full setup, run <code>prism install cursor</code>.
                  </p>
                </div>
              ) : null}
              <ConfigBlock
                lang="json"
                path="~/.prism/config.json"
                text={PRISM_RECEIPT_CONFIG}
                footer="Add to the file if it already has settings."
              />
            </div>
          </Container>
        </section>

        <section className="sec">
          <Container className="grid2 items-start">
            <div>
              <h2 className="d3 mb-5">What install writes</h2>
              <div className="card tcard">
                <Table>
                  <thead>
                    <tr>
                      <th>Where</th>
                      <th>What</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agent.writes.map(([where, what]) => (
                      <tr key={where}>
                        <td className="nw">
                          <code>{where}</code>
                        </td>
                        <td>{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
            <div>
              <h2 className="d3 mb-5">Then</h2>
              <ol className="m-0 list-decimal pl-[22px] text-[17px] leading-[1.9] text-ink2">
                <li>Restart {agent.name}.</li>
                <li>
                  Run <code>prism doctor</code> to check the setup.
                </li>
                <li>Ask for a change in plain words.</li>
                <li>{agent.after}</li>
              </ol>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
