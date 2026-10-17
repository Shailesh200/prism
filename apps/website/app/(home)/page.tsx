import Link from "next/link";
import type { ReactNode } from "react";
import { AgentLogo } from "@/components/ui/agent-logo";
import { Button } from "@/components/ui/button";
import { StarButton } from "@/components/ui/star-button";
import { Card, FeatureList, Stat, Steps } from "@/components/ui/card";
import { ChatTerminalPair } from "@/components/ui/chat-terminal-pair";
import { Command } from "@/components/ui/command";
import { Container } from "@/components/ui/container";
import { CtaBand, INSTALL_COMMAND } from "@/components/ui/cta-band";
import { Pill } from "@/components/ui/pill";
import { Failed, Ln, Proven, Typed, cells } from "@/components/ui/term";
import { Bubble, ToolTag, Window } from "@/components/ui/window";
import { SiteFooter } from "@/components/site/site-footer";
import { PrepareDemo, VerifyDemo } from "@/components/site/demos";
import { SiteNav } from "@/components/site/site-nav";
import { AGENTS } from "@/lib/agents";
import { SITE_DESCRIPTION, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  description: SITE_DESCRIPTION,
  path: "/",
});

function Hero() {
  return (
    <section className="hero pt-9 pb-10 sm:pt-[72px] sm:pb-[88px]">
      <Container className="grid2 hero-grid grid-cols-[minmax(0,1.12fr)_minmax(0,.88fr)]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- the supplied lockup SVG, no optimizer */}
          <img
            src="/brand/prism-horizontal-light.svg"
            alt="Prism"
            width={207}
            height={44}
            className="block h-11 w-auto sm:h-14"
          />
          <h1 className="d1 hero-h mt-[22px] sm:mt-7">
            Know before <em>you ship.</em>
          </h1>
          <p className="hero-sub mt-4 mb-5 sm:mb-6">
            When Claude Code stops, Prism runs your checks on what changed and
            gives one verdict: SHIP, NOT PROVEN or NO-SHIP.
          </p>
          <p className="lede hero-lede mb-7">
            One command sets it up for Claude Code, Cursor, Codex and opencode.
            It shows every config it will change, asks first, and backs each one
            up. Everything runs on your machine.
          </p>
          <Command cmd={INSTALL_COMMAND} />
          <div className="hero-acts mt-5">
            <Button href="/install">Install guide</Button>
            <StarButton />
          </div>
          <p className="hero-agents">
            For Claude Code, Codex, opencode and Cursor.
          </p>
          <div className="tags mt-6">
            <Pill tone="brand">Free · MIT</Pill>
            <Pill tone="brand">Runs on your machine</Pill>
            <Pill tone="brand">No account</Pill>
          </div>
        </div>
        <div>
          <VerifyDemo />
          <p className="cap">
            What happens when your agent stops: your checks run and you get one
            verdict.
          </p>
        </div>
      </Container>
    </section>
  );
}

function FeatureBlock({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <section className="sec">
      <Container className="grid2 grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div>
          <h2 className="d2 mb-4">{title}</h2>
          <p className="lede">{lede}</p>
        </div>
        <div>{children}</div>
      </Container>
    </section>
  );
}

const WHAT_IT_DOES = [
  {
    title: "What does the review show?",
    href: "/product/review",
    body: "Review ranks this session’s changes by risk and lists the tests that reach them. A lens sets the angle: structure, proof or small clean fixes.",
  },
  {
    title: "What breaks if I change this?",
    href: "/product/blast-radius",
    body: "Blast radius lists every caller and test a change reaches, from the map of your code.",
  },
  {
    title: "Is this rename or delete safe?",
    href: "/product/guardrails",
    body: "Guardrails list every edit site, say what still imports a file, and stop edits to generated files.",
  },
  {
    title: "Is the change ready to ship?",
    href: "/product/receipts",
    body: "When the agent stops, Prism runs your checks on what changed, and the receipt says SHIP, NOT PROVEN or NO-SHIP.",
  },
  {
    title: "Can it run my routine?",
    href: "/product/habits",
    body: "Write a habit like “deploy” once. Say its name and your agent runs the steps.",
  },
];

const icon = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />

        <section className="sec">
          <Container>
            <div className="eyebrow">How it works</div>
            <h2 className="d2 mt-3 mb-11">Three steps.</h2>
            <Steps
              items={[
                {
                  title: "Install",
                  body: (
                    <>
                      One command. <code>prism start</code> connects the agents
                      on your machine and maps your code.
                    </>
                  ),
                },
                {
                  title: "Ask as usual",
                  body: "Type your request in plain words. Prism adds the files, tests and code to reuse. No tool names needed.",
                },
                {
                  title: "Review before you push",
                  body: "Ask for a review. Prism ranks the session’s changes by risk and lists the tests that reach them. When the agent stops, the receipt says SHIP, NOT PROVEN or NO-SHIP.",
                },
              ]}
            />
          </Container>
        </section>

        <FeatureBlock
          title="Prepare, before the edit"
          lede="Ask for a change and Prism adds the files to open, a signature for the top one, the tests and the command to run them."
        >
          <PrepareDemo />
        </FeatureBlock>

        <FeatureBlock
          title="Review, after the edit"
          lede="The QA lens looks at proof: which changed functions have a test, which callers the change touches and which tests reach it. When your agent stops, Prism runs those tests. If one fails, the receipt says NO-SHIP."
        >
          <ChatTerminalPair
            chat={
              <Window title="Claude Code" kind="chat">
                <Bubble who="you">Tidy up the reduce in computeTotals</Bubble>
                <Bubble who="agent" name="Claude Code">
                  Done. The reduce in computeTotals is shorter now.
                </Bubble>
                <Bubble who="prism">
                  <span className="r">Prism · NO-SHIP (1 check failed)</span>
                  <br />
                  Prism receipt: changed 1 file, 5 dependents, 2 tests reach it
                  — NO-SHIP
                  <br />
                  <Proven />
                  <br />
                  <Failed />
                </Bubble>
                <Bubble who="agent" name="Claude Code">
                  The test caught it: I wrote price + qty instead of price *
                  qty. Fixed, and the next receipt says SHIP.
                </Bubble>
              </Window>
            }
            terminal={
              <Window title="~/northwind">
                <Typed cmd="prism receipts show 1" />
                <Ln>
                  <span className="w">Prism · NO-SHIP (1 check failed)</span>
                </Ln>
                <Ln>
                  Prism receipt: changed 1 file, 5 dependents, 2 tests reach it
                  — NO-SHIP
                </Ln>
                <Ln>
                  <Proven />
                </Ln>
                <Ln>
                  <Failed />
                </Ln>
              </Window>
            }
          />
        </FeatureBlock>

        <FeatureBlock
          title="Every caller"
          lede="Ask where a function is used. Prism lists each caller from its map, so the change reaches all of them."
        >
          <ChatTerminalPair
            chat={
              <Window title="Claude Code" kind="chat">
                <Bubble who="you">Where do we call getUser?</Bubble>
                <Bubble who="prism">
                  <ToolTag>graph</ToolTag>
                  <span className="d">mode: neighbors · direction: in</span>
                  <br />
                  <span className="w">getUser</span>{" "}
                  <span className="d">function · src/users/api.ts</span>
                  <br />← src/pages/checkout.ts{" "}
                  <span className="d">references · measured</span>
                  <br />← src/users/profile.ts{" "}
                  <span className="d">references · measured</span>
                </Bubble>
                <Bubble who="agent" name="Claude Code">
                  getUser is called in two places: checkout.ts and profile.ts.
                  Both pass a user id.
                </Bubble>
              </Window>
            }
            terminal={
              <Window title="~/northwind">
                <Typed cmd="prism refs getUser" />
                <Ln>
                  <span className="w">2 references</span>
                </Ln>
                <Ln />
                <Ln>
                  <span className="d">{cells(21, "PATH", "KIND  OFFSET")}</span>
                </Ln>
                <Ln>{cells(21, "src/pages/checkout.ts", "call     232")}</Ln>
                <Ln>{cells(21, "src/users/profile.ts", "call     117")}</Ln>
              </Window>
            }
          />
        </FeatureBlock>

        <section className="sec">
          <Container className="grid2 grid-cols-[minmax(0,.55fr)_minmax(0,1.45fr)] items-start">
            <div>
              <div className="eyebrow">What it does</div>
              <h2 className="d2 mt-3 mb-[18px]">Questions Prism answers.</h2>
              <p className="lede">
                Prism answers from a local map of your repo and runs your own
                checks. No model is involved.
              </p>
            </div>
            <FeatureList items={WHAT_IT_DOES} />
          </Container>
        </section>

        <section className="sec">
          <Container className="grid2 grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)]">
            <div>
              <div className="eyebrow">Benchmarks</div>
              <h2 className="d2 mt-3 mb-[18px]">Measured on real fixes.</h2>
              <p className="lede">
                Real coding agents on real fixes from public repositories, with
                Prism and without it. The method and every result are on the
                benchmarks page.
              </p>
              <Button href="/benchmarks" variant="line" className="mt-6">
                See the benchmarks
              </Button>
            </div>
            <div className="grid3 gap-4">
              <Stat n="−28" unit="%">
                fewer tokens for the same tests passing (opencode, 11 small
                fixes)
              </Stat>
              <Stat n="6 of 6">
                habits ran when asked (Cursor agent CLI 4 of 4, opencode 2 of 2)
              </Stat>
              <Stat n="At stop">Claude Code gives a verdict at stop.</Stat>
            </div>
          </Container>
        </section>

        <section className="sec">
          <Container className="grid3">
            <Card
              icon={
                <svg {...icon}>
                  <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5V13H3z" />
                  <path d="M1.5 13h17l-1 2.5h-15z" />
                </svg>
              }
              title="Privacy is the default"
            >
              Runs on your machine. No account, no telemetry, nothing uploaded.
              The only network call is a daily update check you can turn off.
            </Card>
            <Card
              icon={
                <svg {...icon}>
                  <path d="M7 2v4M13 2v4M5 6h10v3a5 5 0 0 1-10 0z" />
                  <path d="M10 14v4" />
                </svg>
              }
              title="Works with your agent"
            >
              <span className="agents">
                {AGENTS.map((a) => (
                  <Link key={a.slug} href={`/install/${a.slug}`}>
                    <AgentLogo slug={a.slug} size={16} />
                    {a.name}
                  </Link>
                ))}
              </span>
            </Card>
            <Card
              icon={
                <svg {...icon}>
                  <path d="M7 6l-4 4 4 4M13 6l4 4-4 4M11 4l-2 12" />
                </svg>
              }
              title="Open source"
            >
              Free and MIT. Read the code or build it yourself.
            </Card>
          </Container>
        </section>

        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
