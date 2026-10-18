import Link from "next/link";
import { AgentLogo } from "@/components/ui/agent-logo";
import { Card } from "@/components/ui/card";
import { ConfigBlock } from "@/components/ui/config-block";
import { Command } from "@/components/ui/command";
import { Container } from "@/components/ui/container";
import { CheckCircleIcon, LayersIcon, ShieldIcon } from "@/components/ui/icons";
import { PageHero } from "@/components/ui/page-hero";
import { StartDemo } from "@/components/site/demos";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { AGENTS } from "@/lib/agents";
import { PRISM_MCP_JSON_STRING, PRISM_RECEIPT_CONFIG } from "@/lib/mcp-install";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Install",
  description:
    "Install the CLI, then prism install all connects every agent on this machine. Open the agent again.",
  path: "/install",
});

export default function InstallPage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          eyebrow="Install"
          title={
            <>
              Install, <em>then connect.</em>
            </>
          }
          lede={
            <>
              The first command puts Prism on this machine. The second connects
              every agent it finds. Quit the agent and open it again. The first
              time you use Prism in a repository, it builds the index on this
              machine.
            </>
          }
          actions={
            <div className="grid w-full gap-3">
              <Command cmd="npm install -g @prismapp/cli" />
              <Command cmd="prism install all" />
              <p className="cap">
                One agent only: <code>prism install</code> and its name. Add{" "}
                <code>--project</code> to write that agent’s files into this
                repo.
              </p>
            </div>
          }
          aside={<StartDemo />}
        />

        <section className="sec">
          <Container>
            <h2 className="d3 mb-2.5">Or pick an agent</h2>
            <p className="mb-6 text-ink3">
              Use <code>prism install all</code> for every agent on this
              machine, or add <code>--project</code> to write that agent’s files
              into this repo. Each page also shows the config to add by hand.
            </p>
            <div className="grid4">
              {AGENTS.map((a) => (
                <Link
                  key={a.slug}
                  href={`/install/${a.slug}`}
                  className="card block"
                >
                  <h3 className="t flex items-center gap-2.5">
                    <AgentLogo slug={a.slug} size={20} />
                    {a.name}
                  </h3>
                  <p className="mt-2.5 font-mono text-sm text-ink">
                    prism install {a.client}
                  </p>
                  <p>{a.gets}</p>
                </Link>
              ))}
            </div>
          </Container>
        </section>

        <section className="sec" id="custom">
          <Container className="setup">
            <div>
              <h2 className="d3 mb-3.5">Any other MCP agent</h2>
              <p className="lede text-lg">
                Prism is a standard MCP server. Add this entry to your agent’s
                MCP config; it starts the published server with <code>npx</code>
                .
              </p>
              <p className="mt-4 text-ink2">
                There are no hooks here, so nothing runs on its own. Turn on the{" "}
                <code>receipt</code> tool and ask the agent to call{" "}
                <code>prepare_change</code> before it edits and{" "}
                <code>receipt</code> before it says it is done.
              </p>
            </div>
            <div className="grid min-w-0 gap-5">
              <ConfigBlock
                lang="json"
                path="mcp.json"
                text={PRISM_MCP_JSON_STRING}
              />
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
          <Container className="grid3">
            <Card icon={<CheckCircleIcon />} title="Check it">
              <code>prism doctor</code> checks the repo, the index and each
              connected agent.
            </Card>
            <Card icon={<LayersIcon />} title="Update">
              <code>npm install -g @prismapp/cli</code> then{" "}
              <code>prism upgrade</code>. The first downloads the new version.
              The second points your agents at it. Memories, receipts, and
              habits stay in <code>~/.prism</code>.
            </Card>
            <Card icon={<ShieldIcon />} title="Remove">
              <code>prism uninstall</code> removes exactly what install wrote.
              Add <code>--purge</code> to delete Prism’s data too.
            </Card>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
