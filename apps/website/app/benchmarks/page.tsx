import Link from "next/link";
import type { ReactNode } from "react";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { Pill } from "@/components/ui/pill";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { Table } from "@/components/ui/table";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import sample from "@/data/benchmarks-sample.json";
import {
  CURSOR_REVIEW_FOUND,
  CURSOR_REVIEW_TOKENS,
  GROUPS,
  HABITS_RAN,
  type Measure,
  OPENCODE_B6_SOLVED,
  OPENCODE_B6_TOKENS,
  OPENCODE_R3_TOKENS,
  change,
  formatChange,
  tok,
  verdict,
} from "@/lib/bench";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Benchmarks",
  description:
    "Prism 2.0 evaluation: real coding agents on real fixes, with and without Prism. Method, agents, tasks and every result, including where Prism did not help.",
  path: "/benchmarks",
});

/*
 * Every number here comes from docs/benchmarks/2.x.md (the published real-agent run) or the Round 2 / Round 3
 * sections of plans/notes/prism-2-next-change-report.md. The simulated reader numbers are read from
 * data/benchmarks-sample.json. Add a number only with its source.
 */

const GLANCE: Array<{
  metric: string;
  value: string;
  means: ReactNode;
  why?: string;
}> = [
  {
    metric: "Files found",
    value: "61.8 %",
    means:
      "Of the files a real fix changed, the share in Prism’s list (220 tasks, 6 repos). The top 3 held 39.1 %.",
  },
  {
    metric: "Tests found",
    value: "64.9 %",
    means: (
      <>
        Of the tests a real fix needed, the share <code>test_impact</code>{" "}
        found. 27.9 % of the tests it listed were needed.
      </>
    ),
  },
  {
    metric: "Change requests recognised",
    value: "99.6 %",
    means: "Prompts asking for a code change that Prism recognised.",
  },
  {
    metric: "Questions mistaken for changes",
    value: "1.3 %",
    means: "Plain questions Prism wrongly treated as a change request.",
  },
  {
    metric: "Review",
    value: "10 of 11",
    means:
      "Seeded problems Claude Code found in review, with and without Prism. Cursor agent CLI: 4 of 7 with, 3 of 7 without.",
    why: "Review with Prism was never worse.",
  },
  {
    metric: "Custom skills",
    value: "10 of 10",
    means:
      "Your own skills ran with Prism installed, on Claude Code, Cursor and opencode.",
  },
  {
    metric: "Habits",
    value: "4/4 · 2/2",
    means:
      "Cursor 4 of 4, opencode 2 of 2. Claude Code ran a habit when you named it (2 of 2), not by itself (0 of 2).",
  },
  {
    metric: "Hook time",
    value: "under 1 s",
    means:
      "At p95 on an idle machine: prompt 896 ms, stop 508 ms; edit hooks 39 ms on an earlier 2.0 build.",
  },
  {
    metric: "Agents",
    value: "4 of 4",
    means:
      "Claude Code, Cursor, Codex and opencode pass install, doctor and a sample hook on macOS.",
  },
];

const WINS: Array<{
  m: Measure;
  title: string;
  who: string;
  also?: Measure;
}> = [
  {
    m: OPENCODE_R3_TOKENS,
    title: "Fewer tokens for the same tests passing",
    who: "opencode · 11 small fixes · tests pass 8 of 11 both ways",
  },
  {
    m: CURSOR_REVIEW_FOUND,
    title: "More seeded problems found in review",
    who: "Cursor agent CLI (grok-4.7-high) · 4 reviews each way",
    also: CURSOR_REVIEW_TOKENS,
  },
  {
    m: OPENCODE_B6_SOLVED,
    title: "One more task solved",
    who: "opencode · 11 small fixes",
    also: OPENCODE_B6_TOKENS,
  },
  {
    m: HABITS_RAN,
    title: "Your habits run when you ask",
    who: "Cursor agent CLI 4 of 4, opencode 2 of 2",
  },
];

const TONE = { win: "ok", loss: "bad", tie: undefined } as const;

function ChangePill({ m }: { m: Measure }) {
  return <Pill tone={TONE[verdict(m)]}>{formatChange(m)}</Pill>;
}

/** Two bars on one scale: without Prism, then with it. */
function Bars({ m }: { m: Measure }) {
  const max = Math.max(m.without.v, m.with.v) || 1;
  const rows = [
    ["Without", m.without, false],
    ["With Prism", m.with, true],
  ] as const;
  return (
    <div className="bars">
      {rows.map(([label, val, on]) => (
        <div key={label} className="bar">
          <span>{label}</span>
          <i>
            <b
              className={cx(on && "on")}
              style={{ width: `${Math.max((val.v / max) * 100, 2)}%` }}
            />
          </i>
          <span className="v">{val.text}</span>
        </div>
      ))}
    </div>
  );
}

function Win({ m, title, who, also }: (typeof WINS)[number]) {
  const c = change(m);
  return (
    <div className="card win">
      <div className="num">{c === null ? m.with.text : formatChange(m)}</div>
      <h3 className="t mt-3">{title}</h3>
      <p className="text-[15px]">{who}</p>
      <Bars m={m} />
      {also && (
        <p className="mt-3 text-[15px]">
          Also {also.label.toLowerCase()}: <ChangePill m={also} />
        </p>
      )}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");
const SIM = sample.totals;
const SIM_CALLS: Measure = {
  label: "Tool calls",
  without: tok(SIM.withoutPrism.toolCalls),
  with: tok(SIM.withPrism.toolCalls),
  better: "lower",
};
const SIM_TOKENS: Measure = {
  label: "Estimated tokens",
  without: tok(SIM.withoutPrism.estimatedTokens),
  with: tok(SIM.withPrism.estimatedTokens),
  better: "lower",
};

const Value = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-base font-medium whitespace-nowrap text-ink">
    {children}
  </span>
);

const METHOD: Array<[term: string, detail: ReactNode]> = [
  [
    "Agents",
    "Claude Code (claude-opus-5-5), Cursor agent CLI (grok-4.7-high), opencode (mimo-v2.6-flash-free)",
  ],
  [
    "Tasks",
    "Real fixes, three-turn follow-ups and reviews with seeded problems, on public repositories (mainly es-toolkit and hono)",
  ],
  [
    "Grading",
    "Tests run on every result. Quality graded 1 to 5 by a grader that does not know which run used Prism",
  ],
  [
    "Setup",
    "One 8 GB macOS machine. Tokens, time and cost are medians per task",
  ],
  ["Scope", "Small samples. Prism’s own evaluation, not an independent audit"],
  [
    "Not published",
    "A “tokens saved” estimate: it did not hold up when checked",
  ],
];

export default function BenchmarksPage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          eyebrow="Benchmarks"
          title={
            <>
              Prism 2.0, <em>measured.</em>
            </>
          }
          lede="Real coding agents on real fixes from public repositories, with Prism and without it, on the same tasks and the same model. Every result is published, including where Prism did not help."
        />

        <section className="sec">
          <Container>
            <h2 className="d3">Where Prism helps</h2>
            <p className="lede mt-3.5 mb-7 text-lg">
              The best results. The full results below list every measure,
              including the ones where Prism did worse.
            </p>
            <div className="grid4">
              {WINS.map((w) => (
                <Win key={w.title} {...w} />
              ))}
            </div>
          </Container>
        </section>

        <section className="sec">
          <Container>
            <h2 className="d3">Accuracy at a glance</h2>
            <p className="lede mt-3.5 mb-7 text-lg">
              How well Prism picks files and tests (220 tasks, 6 public
              repositories), spots change requests, and how fast its hooks run.
            </p>
            <div className="card tcard">
              <Table className="t-kv">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {GLANCE.map((g) => (
                    <tr key={g.metric}>
                      <td className="nw">
                        <b className="font-semibold">{g.metric}</b>
                      </td>
                      <td className="nw">
                        <Value>{g.value}</Value>
                      </td>
                      <td>
                        {g.means}
                        {g.why && <span className="text-ink3"> {g.why}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Container>
        </section>

        <section className="sec">
          <Container>
            <h2 className="d3">Full results</h2>
            <p className="lede mt-3.5 mb-7 text-lg">
              Every with-and-without comparison. Change is with Prism against
              without, on the same tasks and the same model.
            </p>
            <div className="mb-6">
              <Callout tone="info" title="How to read these numbers">
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Change is with Prism against without, on the same tasks and
                    the same model. Green is better, red is worse.
                  </li>
                  <li>
                    Tokens, time and cost are medians per task. Grades are 1 to
                    5, given by a grader that does not know which run used
                    Prism.
                  </li>
                  <li>
                    Compare within one tool only: each tool ran its own tasks
                    with its own model.
                  </li>
                  <li>
                    Hook times are p95 on an idle machine. Under heavy load the
                    stop hook took 1,307 ms at p95.
                  </li>
                </ul>
              </Callout>
            </div>
            <div className="grid2 items-start gap-6">
              {GROUPS.map((g) => (
                <div key={g.tool + g.run} className="card tcard bgroup">
                  <div className="bg-h">
                    <b>{g.tool}</b> <span>· {g.model}</span>
                    <p>{g.run}</p>
                  </div>
                  <Table className="t-cmp">
                    <thead>
                      <tr>
                        <th>Measure</th>
                        <th>Without</th>
                        <th>With</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.measures.map((m) => (
                        <tr key={m.label}>
                          <td>{m.label}</td>
                          <td className="nw">
                            <Value>{m.without.text}</Value>
                          </td>
                          <td className="nw">
                            <Value>{m.with.text}</Value>
                          </td>
                          <td className="nw">
                            <ChangePill m={m} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {g.note && <p className="bg-f">{g.note}</p>}
                </div>
              ))}
            </div>
            <p className="mt-5 text-[15px] text-ink3">
              Tokens, time and cost are medians per task; grades are 1 to 5,
              blind. Compare within one tool only.{" "}
              <Link href="/docs/benchmarks/2.x">
                <u>Full method and raw results</u>
              </Link>
              .
            </p>
          </Container>
        </section>

        <section className="sec">
          <Container className="grid2 grid-cols-[minmax(0,.62fr)_minmax(0,1.38fr)] items-start">
            <div>
              <h2 className="d3">Simulated reader</h2>
              <p className="lede mt-3.5 text-lg">
                Five questions on {sample.fixtures.length} small repositories,
                answered once by listing and reading files and once through
                Prism. No model is involved; tokens are estimated as bytes ÷ 4.
              </p>
            </div>
            <div className="card tcard">
              <Table className="t-cmp">
                <thead>
                  <tr>
                    <th>Simulated</th>
                    <th>Reading files</th>
                    <th>Through Prism</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <b className="font-semibold">Tool calls</b>
                    </td>
                    <td>
                      <Value>{fmt(SIM.withoutPrism.toolCalls)}</Value>
                    </td>
                    <td>
                      <Value>{fmt(SIM.withPrism.toolCalls)}</Value>
                    </td>
                    <td>
                      <ChangePill m={SIM_CALLS} />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <b className="font-semibold">Estimated tokens</b>
                    </td>
                    <td>
                      <Value>{fmt(SIM.withoutPrism.estimatedTokens)}</Value>
                    </td>
                    <td>
                      <Value>{fmt(SIM.withPrism.estimatedTokens)}</Value>
                    </td>
                    <td>
                      <ChangePill m={SIM_TOKENS} />
                    </td>
                  </tr>
                </tbody>
              </Table>
              <p className="mt-2 mb-3 text-[15px] text-ink3">
                Recorded {sample.recordedAt.slice(0, 10)}. A simulation shows
                how much reading Prism replaces, not what a real agent saves;
                the full results above do.
              </p>
            </div>
          </Container>
        </section>

        <section className="sec">
          <Container>
            <h2 className="d3 mb-6">Method</h2>
            <dl className="method">
              {METHOD.map(([term, detail]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
