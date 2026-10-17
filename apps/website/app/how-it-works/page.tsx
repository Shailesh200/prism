import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import {
  ChatIcon,
  LayersIcon,
  ShieldIcon,
  SpokesIcon,
} from "@/components/ui/icons";
import { PageHero } from "@/components/ui/page-hero";
import { GuardDemo, StartDemo, VerifyDemo } from "@/components/site/demos";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "How it works",
  description:
    "Prism maps your code on your machine, guards edits and checks the change when your agent stops.",
  path: "/how-it-works",
});

function Step({
  n,
  title,
  lede,
  children,
}: {
  n: number;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sec">
      <Container className="grid2 grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div>
          <div className="eyebrow">Step {n}</div>
          <h2 className="d2 mt-3 mb-4">{title}</h2>
          <p className="lede">{lede}</p>
        </div>
        <div>{children}</div>
      </Container>
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          eyebrow="How it works"
          title={
            <>
              Map, guard, <em>review.</em>
            </>
          }
          lede="Prism runs on your machine next to your agent. It maps your code, guards edits and checks the change when the agent stops."
        />
        <Step
          n={1}
          title="Map"
          lede="Prism reads your code and builds a local map: files, functions, imports and tests. A background process keeps it up to date."
        >
          <StartDemo />
        </Step>
        <Step
          n={2}
          title="Guard"
          lede="While the agent edits, Prism stops edits to generated files and flags widely used ones. These hooks run on Claude Code and opencode; on Cursor and Codex, a rule asks the agent to call Prism before and after a change."
        >
          <GuardDemo />
        </Step>
        <Step
          n={3}
          title="Review"
          lede="When the agent stops, Prism runs your checks on what changed. The receipt gives one verdict and lists each check with its result."
        >
          <VerifyDemo />
        </Step>
        <section className="sec">
          <Container className="grid4">
            <Card icon={<SpokesIcon />} title="One map for every surface">
              Your agent (MCP), the hooks and the <code>prism</code> CLI all
              read the same local map.
            </Card>
            <Card icon={<ChatIcon />} title="Nine tools for your agent">
              Your agent picks them from your words: “where is this used”,
              “review my changes”, “run my deploy habit”.
            </Card>
            <Card icon={<LayersIcon />} title="Analysis has no model">
              Answers come from the local map and your own test scripts.
            </Card>
            <Card icon={<ShieldIcon />} title="Clean uninstall">
              Install records every file it writes. <code>prism uninstall</code>{" "}
              removes exactly that.
            </Card>
          </Container>
        </section>
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
