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
import {
  GROUPS,
  HABITS_RAN,
  type Measure,
  change,
  formatChange,
  verdict,
} from "@/lib/bench";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Benchmarks",
  description:
    "Prism evaluation: real coding agents on real fixes, with and without Prism. Method, agents, tasks and every result, including where Prism did not help.",
  path: "/benchmarks",
});

/*
 * Every number here comes from docs/benchmarks/2.x.md (the published real-agent run) or the Round 2 / Round 3
 * sections of plans/notes/prism-2-next-change-report.md. Add a number only with its source.
 */

const GLANCE: Array<{
  metric: string;
  value: string;
  means: ReactNode;
  why?: string;
}> = [
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
      "At p95 on an idle machine: prompt 896 ms, stop 508 ms; edit hooks 39 ms on an earlier build.",
  },
  {
    metric: "Verdict at stop",
    value: "Claude Code",
    means: "Claude Code gives a verdict at stop.",
  },
];

const WINS: Array<{
  m?: Measure;
  stat?: string;
  title: string;
  who: string;
  also?: Measure;
}> = [
  {
    stat: "At stop",
    title: "Claude Code gives a verdict at stop.",
    who: "In Codex and opencode, the verdict comes with the next receipt. In Cursor, ask for a receipt.",
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

function Win({ m, stat, title, who, also }: (typeof WINS)[number]) {
  const c = m ? change(m) : null;
  return (
    <div className="card win">
      <div className="num">
        {m ? (c === null ? m.with.text : formatChange(m)) : stat}
      </div>
      <h3 className="t mt-3">{title}</h3>
      <p className="text-[15px]">{who}</p>
      {m ? <Bars m={m} /> : null}
      {also && (
        <p className="mt-3 text-[15px]">
          Also {also.label.toLowerCase()}: <ChangePill m={also} />
        </p>
      )}
    </div>
  );
}

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
    "Real fixes and three-turn follow-ups on public repositories (mainly es-toolkit and hono)",
  ],
  [
    "Grading",
    "Tests run on every result. Quality graded 1 to 5 by a grader that does not know which run used Prism",
  ],
  ["Setup", "One 8 GB macOS machine. Time is a median per task."],
  ["Scope", "Small samples. Prism’s own evaluation, not an independent audit"],
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
              Prism, <em>measured on real repos.</em>
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
              Custom skills, habits, hook speed and the verdict at stop.
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
            <div className="bench-read">
              <aside className="bench-aside">
                <Callout tone="info" title="How to read these numbers">
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      Change is with Prism against without, on the same tasks
                      and the same model. Green is better, red is worse.
                    </li>
                    <li>
                      Time is a median per task. Grades are 1 to 5, given by a
                      grader that does not know which run used Prism.
                    </li>
                    <li>
                      Compare within one tool only: each tool ran its own tasks
                      with its own model.
                    </li>
                    <li>
                      Hook times are p95 on an idle machine. Under heavy load
                      the stop hook took 1,307 ms at p95.
                    </li>
                  </ul>
                </Callout>
              </aside>
              <div>
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
                  Time is a median per task; grades are 1 to 5, blind. Compare
                  within one tool only.
                </p>
              </div>
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
