import Link from "next/link";
import type { ReactNode } from "react";
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
import { MatchCodeDemo, PrepareDemo } from "@/components/site/demos";
import { SiteNav } from "@/components/site/site-nav";
import { SITE_DESCRIPTION, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  description: SITE_DESCRIPTION,
  path: "/",
});

const PROMPT = "add VAT to invoice totals";

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
            Software intelligence <em>for your agent.</em>
          </h1>
          <p className="hero-sub mt-3 mb-4">
            Prepare the change, make it, then review and ship.
          </p>
          <p className="lede hero-lede mb-6">
            Prism is a one-stop software intelligence system that helps your AI
            agents write better code. It prepares the files that need to be
            edited. House style helps the agent make the smallest change that
            matches this repo. Prism then reviews the code, finds bugs, and
            gives you a ship or no-ship result.
          </p>
          <Command cmd={INSTALL_COMMAND} />
          <div className="hero-acts mt-5">
            <Button href="/install">Install guide</Button>
            <StarButton />
          </div>
          <p className="hero-agents">
            Works with the coding agent you already use.
          </p>
          <div className="tags mt-6">
            <Pill tone="brand">Free · MIT</Pill>
            <Pill tone="brand">Runs on your machine</Pill>
            <Pill tone="brand">No account</Pill>
          </div>
        </div>
        <div>
          <ChatTerminalPair
            chat={
              <Window title="Your agent" kind="chat">
                <Bubble who="you">Add VAT to invoice totals</Bubble>
                <Bubble who="prism">
                  <span className="stage">Prepare</span>
                  src/billing/invoice.ts
                  <br />
                  src/billing/totals.ts
                  <span className="stage">Edit</span>
                  Follow invoiceTotal in this repo.
                  <br />
                  Also used in src/checkout/summary.ts.
                </Bubble>
                <Bubble who="agent" name="Agent">
                  I’ll edit those files and update the code that calls them.
                </Bubble>
                <Bubble who="prism">
                  <span className="stage">Review</span>
                  No blocked files. The tests have not been run yet.
                  <br />
                  Receipt: NOT PROVEN
                </Bubble>
              </Window>
            }
            terminal={
              <Window title="~/northwind">
                <Typed cmd={`prism prepare "${PROMPT}"`} />
                <Ln>
                  <span className="w">Prepare: add VAT to invoice totals</span>
                </Ln>
                <Ln />
                <Ln>
                  <span className="d">{cells(9, "Files", "")}</span>4
                </Ln>
                <Ln>
                  <span className="d">{cells(9, "Tests", "")}</span>2
                </Ln>
                <Ln>
                  <span className="d">{cells(9, "Reuse", "")}</span>2
                </Ln>
                <Ln>
                  <span className="d">{cells(9, "Truncated", "")}</span>no
                </Ln>
                <Ln />
                <Ln>
                  <span className="d">{cells(23, "PATH", "WHY")}</span>
                </Ln>
                <Ln>
                  {cells(
                    23,
                    "src/billing/invoice.ts",
                    "matches invoice, total; seed file",
                  )}
                </Ln>
                <Ln>
                  {cells(
                    23,
                    "src/billing/totals.ts",
                    "matches total; import distance 1",
                  )}
                </Ln>
                <Ln>
                  {cells(23, "src/checkout/summary.ts", "import distance 1")}
                </Ln>
                <Ln>{cells(23, "src/lib/money.ts", "import distance 1")}</Ln>
                <Ln />
                <Ln>
                  <span className="d">Reuse</span>
                </Ln>
                <Ln>
                  {`  ${cells(12, "invoiceTotal", "src/billing/invoice.ts")}`}
                </Ln>
                <Ln>{`  ${cells(4, "Line", "src/billing/invoice.ts")}`}</Ln>
                <Ln>
                  <span className="d">…</span>
                </Ln>
              </Window>
            }
          />
          <p className="cap">
            One conversation: the files to open, the edit, and a{" "}
            <Link href="/product/receipts">receipt</Link>.
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
      <Container className="xrow grid2 grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="xrow-copy">
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
    title: "What should I open for this task?",
    href: "/product/prepare",
    body: "Prepare hands the agent the few files that matter, the tests to run and code to reuse.",
  },
  {
    title: "How does this repo do it?",
    href: "/product/prepare",
    body: "Match the code points at a file from your own code to copy, never a fixture or a test.",
  },
  {
    title: "What did the agent miss?",
    href: "/product/review",
    body: "Review reads the change and groups findings as Critical, High, Low, and Nit, then gives a Receipt.",
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
    body: "When the agent stops, Prism runs your typecheck, lint and the tests the change reaches, and the receipt says SHIP, NOT PROVEN or NO-SHIP.",
  },
  {
    title: "How should the agent work?",
    href: "/product/lenses",
    body: "Dev follows the code already in the repo and the blast radius. QA and Architect check the change for bugs and structure.",
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
                      Install the CLI, then run <code>prism install all</code>.
                      It connects every agent on this machine. Open the agent
                      again.
                    </>
                  ),
                },
                {
                  title: "Match the code",
                  body: "While the agent writes, Prism points at a file from your repo to copy. The new code follows that file.",
                },
                {
                  title: "Review",
                  body: "Guardrails, QA, and Architect. The receipt says SHIP, NOT PROVEN, or NO-SHIP.",
                },
              ]}
            />
          </Container>
        </section>

        <FeatureBlock
          title="Prepare, before the edit"
          lede="Names the files to open, the tests to run, and code already in the repo to reuse."
        >
          <PrepareDemo />
        </FeatureBlock>

        <FeatureBlock
          title="Match the code, during the edit"
          lede="Points at a file already in your repo to copy, so the new code looks like the rest. Never a fixture or a test."
        >
          <MatchCodeDemo />
        </FeatureBlock>

        <FeatureBlock
          title="Review, after the edit"
          lede="Guardrails, QA, and Architect. Findings are Critical, High, Low, or Nit. The receipt says whether to ship."
        >
          <ChatTerminalPair
            chat={
              <Window title="Your agent" kind="chat">
                <Bubble who="you">Tidy up the reduce in computeTotals</Bubble>
                <Bubble who="agent" name="Agent">
                  Done. The reduce in computeTotals is shorter now.
                </Bubble>
                <Bubble who="prism">
                  <span className="r">Prism · NO-SHIP (1 check failed)</span>
                  <br />
                  Prism receipt: changed 1 file, 5 dependents, 2 tests reach it.
                  NO-SHIP
                  <br />
                  <Proven />
                  <br />
                  <Failed />
                </Bubble>
                <Bubble who="agent" name="Agent">
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
                  Prism receipt: changed 1 file, 5 dependents, 2 tests reach it.
                  NO-SHIP
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
              <Window title="Your agent" kind="chat">
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
                <Bubble who="agent" name="Agent">
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
                From the Prism 2.0 evaluation on 220 tasks in six public
                repositories. The method and every result are on the benchmarks
                page.
              </p>
              <Button href="/benchmarks" variant="line" className="mt-6">
                See the benchmarks
              </Button>
            </div>
            <div className="grid3 gap-4">
              <Stat n="61.8" unit="%">
                of the files the real fix changed were in Prism’s pack (220
                tasks, 6 repos)
              </Stat>
              <Stat n="64.9" unit="%">
                of the tests a real fix needed were found by Prism (same 220
                tasks)
              </Stat>
              <Stat n="4 of 4">
                agents pass install, doctor and a sample hook
              </Stat>
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
              Runs on your machine. No account, and your code stays here. A
              usage ping sends the command or tool name and whether it worked.
              `PRISM_PULSE=0` turns that off.
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
              Any coding agent that can call tools. One install connects the
              agent already on your machine.
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
