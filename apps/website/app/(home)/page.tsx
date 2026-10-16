import Link from "next/link";
import type { ReactNode } from "react";
import { CommandBar } from "@/components/paper/blocks";
import {
  BlastExample,
  PrepareExample,
  ReviewExample,
} from "@/components/paper/examples";
import { Logo } from "@/components/paper/logo";
import { Shell, StarLink } from "@/components/paper/shell";
import { DOCTOR_COMMAND, NODE_REQUIREMENT } from "@/lib/paper/install-facts";
import { PRODUCT_LINKS } from "@/lib/paper/nav";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Help your AI agent get it right",
  description:
    "Prism gives your coding agent the files, tests and code to reuse before it edits, then ranks the change. Open source and local.",
  path: "/",
});

const STEPS: Array<[string, ReactNode]> = [
  [
    "Install",
    <>
      One command checks the repo. <code>npx -y @repo-prism/cli doctor</code>.
      Connect Claude Code, Cursor, Codex or opencode from the install guide.
    </>,
  ],
  [
    "Ask as usual",
    <>
      Type the request in plain words. <code>prepare_change</code> adds the
      files, tests and code to reuse. No tool names needed.
    </>,
  ],
  [
    "Read the change",
    <>
      <code>prism review</code> ranks the diff. <code>test_impact</code> names
      the tests that reach it. Risk bands are low, mid and high.
    </>,
  ],
];

const PILLARS: Array<[string, string, ReactNode]> = [
  [
    "Right context",
    "Before the edit, your agent gets the files, signatures and tests for the task, so it starts in the right place.",
    <PrepareExample key="prepare" />,
  ],
  [
    "Accurate changes",
    "Ask where something is used. Prism lists callers from the index, so a change can land in each of them.",
    <BlastExample key="blast" />,
  ],
  [
    "A ranked review",
    "After the edit, prism review rolls up blast radius, test impact and a risk band. It does not invent a pass or fail verdict.",
    <ReviewExample key="review" />,
  ],
];

export default function HomePage() {
  return (
    <Shell>
      <section style={{ padding: "72px 0 88px" }}>
        <div
          className="wrap grid2"
          style={{
            gridTemplateColumns: "minmax(0,1.12fr) minmax(0,.88fr)",
            gap: 56,
          }}
        >
          <div>
            <Logo height={44} />
            <h1 className="d1" style={{ margin: "28px 0 18px" }}>
              Help your AI agent <em>get it right.</em>
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Right context", "Accurate changes", "Ranked review"].map(
                (pill) => (
                  <span className="pill" key={pill}>
                    {pill}
                  </span>
                ),
              )}
            </div>
            <p className="lede" style={{ marginTop: 22 }}>
              Prism gives your coding agent the facts about your code before it
              edits: the right files, the tests that cover them and code it can
              reuse. When the agent is done, Prism ranks the change and names
              the tests that reach it.
            </p>
            <p
              style={{
                margin: "16px 0 24px",
                color: "var(--ink3)",
                fontSize: 16,
              }}
            >
              Open source and local. For Claude Code, Cursor, Codex and opencode
              on TypeScript or JavaScript.
            </p>
            <CommandBar command={DOCTOR_COMMAND} />
            <p className="src" style={{ marginTop: 10 }}>
              Run it in your repo. {NODE_REQUIREMENT}
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 18,
                flexWrap: "wrap",
              }}
            >
              <Link className="btn dark" href="/install">
                Install guide
              </Link>
              <StarLink className="btn star" />
            </div>
          </div>
          <div>
            <PrepareExample />
            <p className="cap">
              <b>Right context before the edit.</b> The same answer from{" "}
              <code>prism prepare</code>.
            </p>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="eyebrow">How it works</div>
          <h2 className="d2" style={{ margin: "12px 0 44px" }}>
            Three steps.
          </h2>
          <div className="steps">
            {STEPS.map(([title, body], index) => (
              <div className="step" key={title}>
                <div className="n">{index + 1}</div>
                <h3 className="t">{title}</h3>
                <p style={{ color: "var(--ink2)", margin: "8px 0 0" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {PILLARS.map(([title, body, visual], index) => (
        <section className="sec" key={title}>
          <div
            className="wrap grid2"
            style={{ gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr)" }}
          >
            <div>
              <div className="eyebrow">{index + 1} of 3</div>
              <h2 className="d2" style={{ margin: "12px 0 16px" }}>
                {title}
              </h2>
              <p className="lede">{body}</p>
              <p className="src" style={{ marginTop: 16 }}>
                Switch tabs to see the same answer in your terminal.
              </p>
            </div>
            <div>{visual}</div>
          </div>
        </section>
      ))}

      <section className="sec">
        <div className="wrap grid2" style={{ alignItems: "start" }}>
          <div>
            <div className="eyebrow">What it does</div>
            <h2 className="d2" style={{ margin: "12px 0 18px" }}>
              In plain words.
            </h2>
            <p className="lede">
              Prism doesn’t write code for you. It gives your agent the facts
              about your repo, and ranks the work.
            </p>
          </div>
          <div className="flist" style={{ gridTemplateColumns: "1fr" }}>
            {PRODUCT_LINKS.map((item) => (
              <div key={item.href}>
                <span className="ck">✓</span>
                <span>
                  <Link href={item.href}>
                    <b>{item.label}</b>
                  </Link>
                  <p>{item.text}</p>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap grid2">
          <div>
            <div className="eyebrow">Measured</div>
            <h2 className="d2" style={{ margin: "12px 0 18px" }}>
              Fewer tool calls.
            </h2>
            <p className="lede">
              In the checked-in benchmark sample, answering the same questions
              took 78% fewer tool calls. The full table is on the benchmarks
              page. It does not name a repository.
            </p>
            <Link
              className="btn line"
              style={{ marginTop: 24 }}
              href="/benchmarks"
            >
              See the benchmarks
            </Link>
          </div>
          <div className="grid3" style={{ gap: 16 }}>
            <div className="card">
              <div className="num" style={{ fontSize: 44 }}>
                78<small>%</small>
              </div>
              <p>
                fewer tool calls than a simulated read-and-search pass, across
                the sample.
              </p>
            </div>
            <div className="card">
              <div className="num" style={{ fontSize: 44 }}>
                70
              </div>
              <p>
                tool calls with Prism, against 325 without, in that same sample.
              </p>
            </div>
            <div className="card">
              <div className="num" style={{ fontSize: 44 }}>
                0
              </div>
              <p>
                network calls in the analysis suite. Optional features stay off
                until you turn them on.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap grid3">
          <div className="card fx">
            <h3 className="t">Runs on your machine</h3>
            <p>
              No account and no telemetry. Analysis stays local. Optional
              network features are each off until you turn them on.
            </p>
          </div>
          <div className="card fx">
            <h3 className="t">Works with your agent</h3>
            <p style={{ marginBottom: 14 }}>One MCP server for each:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Claude Code", "Cursor", "Codex", "opencode"].map((name) => (
                <span className="pill plain" key={name}>
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="card fx">
            <h3 className="t">Open source</h3>
            <p>
              MIT licence. Read the code, build it yourself, or star it on
              GitHub.
            </p>
            <div style={{ marginTop: 14 }}>
              <StarLink />
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}
