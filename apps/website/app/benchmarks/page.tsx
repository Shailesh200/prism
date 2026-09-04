import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import Link from "next/link";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { McpInstallPanel } from "@/components/mcp-install-panel";
import { Counter } from "@/components/motion/Counter";
import { SiteFooter } from "@/components/site-footer";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import sampleReport from "@/data/benchmarks-sample.json";

export const metadata: Metadata = {
  title: "Benchmarks",
  description:
    "Agent orientation savings with Prism — six questions on five fixture repos, measured as tool-call counts.",
};

type RunSide = {
  toolCalls: number;
  estimatedTokens: number;
  tokensPerCall?: number;
  elapsedMs: number;
};

type ScenarioRow = {
  scenario: string;
  label: string;
  withoutPrism: RunSide;
  withPrism: RunSide;
  savings: { toolCallsPct: number; tokensPct: number; timePct: number };
};

type BenchReport = {
  recordedAt: string;
  machine?: { platform: string; arch: string; node: string };
  totals: {
    withoutPrism: RunSide;
    withPrism: RunSide;
    savings: { toolCallsPct: number; tokensPct: number; timePct: number };
  };
  fixtures: Array<{
    id: string;
    editTarget: string;
    scenarios: ScenarioRow[];
  }>;
};

const QUESTIONS: Array<{ id: string; tool: string; href: string }> = [
  {
    id: "orient",
    tool: "repository_dna",
    href: "/docs/guides/understand-a-repo",
  },
  {
    id: "safe_edit",
    tool: "blast_radius",
    href: "/docs/guides/before-you-edit",
  },
  {
    id: "health",
    tool: "repository_health",
    href: "/docs/guides/track-health",
  },
  { id: "find", tool: "find_symbol", href: "/docs/reference/mcp-tools" },
  {
    id: "test_impact",
    tool: "test_impact",
    href: "/docs/guides/before-you-edit",
  },
  {
    id: "cycles",
    tool: "dependency_cycles",
    href: "/docs/concepts/graphs",
  },
];

function questionStats(report: BenchReport, id: string) {
  let without = 0;
  let withPrism = 0;
  let label = id;
  for (const fixture of report.fixtures) {
    for (const scenario of fixture.scenarios) {
      if (scenario.scenario !== id) continue;
      label = scenario.label;
      without += scenario.withoutPrism.toolCalls;
      withPrism += scenario.withPrism.toolCalls;
    }
  }
  const saved =
    without === 0 ? 0 : Math.round(((without - withPrism) / without) * 100);
  return { label, without, withPrism, saved };
}

async function loadLatestReport(): Promise<BenchReport | null> {
  return sampleReport as BenchReport;
}

export default async function BenchmarksPage() {
  const report = await loadLatestReport();

  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16">
          <SectionIntro
            index="Nº PROOF"
            title="Benchmarks"
            description="Structural intelligence before an edit — six questions, five fixture repos, measured as tool-call counts."
          />

          <Reveal>
            <section className="space-y-3 text-fd-muted-foreground">
              <h2 className="font-display text-xl font-medium text-fd-foreground">
                What we measure
              </h2>
              <p className="max-w-2xl leading-relaxed">
                The same six questions an agent asks before it edits, on five
                fixture repos. One side lists, greps, and skims. The other calls
                Core — the same tools MCP exposes. We count discrete tool calls
                — the hops an agent takes before it can answer.
              </p>
            </section>
          </Reveal>

          {report ? (
            <Reveal delay={0.05}>
              <section className="space-y-6">
                <h2 className="font-display text-xl font-medium text-fd-foreground">
                  Latest run
                </h2>
                <p className="text-sm text-fd-muted-foreground">
                  Recorded{" "}
                  {new Date(report.recordedAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                  {report.machine
                    ? ` · ${report.machine.platform}/${report.machine.arch} · ${report.machine.node}`
                    : null}
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat label="Tool calls saved">
                    <Counter
                      value={report.totals.savings.toolCallsPct}
                      suffix="%"
                    />
                  </Stat>
                  <Stat label="Naive steps → Prism">
                    <Counter value={report.totals.withoutPrism.toolCalls} />
                    {" → "}
                    <Counter value={report.totals.withPrism.toolCalls} />
                  </Stat>
                  <Stat label="Questions on five fixtures">
                    <Counter
                      value={
                        report.fixtures.length *
                        (report.fixtures[0]?.scenarios.length ??
                          QUESTIONS.length)
                      }
                    />
                  </Stat>
                </div>
              </section>
            </Reveal>
          ) : (
            <Reveal delay={0.05}>
              <p className="text-sm text-fd-muted-foreground">
                No committed sample yet. Run{" "}
                <code className="text-fd-primary">
                  bun run bench:orientation
                </code>{" "}
                after <code className="text-fd-primary">bun run build</code>.
              </p>
            </Reveal>
          )}

          {report ? (
            <Reveal>
              <section className="space-y-8">
                <div className="space-y-3">
                  <h3 className="font-display text-lg font-medium text-fd-foreground">
                    By question
                  </h3>
                  <p className="max-w-2xl text-sm text-fd-muted-foreground">
                    Summed across the five fixtures — list/grep on the left, a
                    Prism tool on the right.
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-fd-border">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-fd-border bg-fd-card">
                        <tr>
                          <th className="px-4 py-3 font-medium">Question</th>
                          <th className="px-4 py-3 font-medium">Without</th>
                          <th className="px-4 py-3 font-medium">With Prism</th>
                          <th className="px-4 py-3 font-medium">Calls saved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {QUESTIONS.map((item) => {
                          const stats = questionStats(report, item.id);
                          return (
                            <tr
                              key={item.id}
                              className="border-b border-fd-border last:border-0"
                            >
                              <td className="px-4 py-3">
                                <Link
                                  href={item.href}
                                  className="hover:text-fd-primary"
                                >
                                  {stats.label}
                                </Link>
                                <div className="mt-0.5 font-mono text-xs text-fd-muted-foreground">
                                  {item.tool}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs tabular-nums">
                                {stats.without}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs tabular-nums">
                                {stats.withPrism}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-fd-primary">
                                −{stats.saved}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 text-sm leading-relaxed text-fd-muted-foreground">
                  <h2 className="font-display text-xl font-medium text-fd-foreground">
                    How to read this
                  </h2>
                  <p>
                    The win is fewer round-trips and a complete structural
                    answer. Naive grep grows with file count; Prism answers stay
                    one or two calls. Wall time includes a cold index per
                    question so the runs stay isolated; a real session pays that
                    once.
                  </p>
                  <p>
                    Re-run locally after{" "}
                    <code className="text-fd-primary">bun run build</code>:{" "}
                    <code className="text-fd-primary">
                      bun run bench:orientation
                    </code>
                    .
                  </p>
                </div>
              </section>
            </Reveal>
          ) : null}

          <Reveal delay={0.1}>
            <section className="space-y-4 border-t border-fd-border pt-10">
              <h2 className="font-display text-xl font-medium text-fd-foreground">
                One-click MCP install
              </h2>
              <p className="text-sm text-fd-muted-foreground">
                Add Prism to your agent in one step, then ask in plain language.
              </p>
              <McpInstallPanel />
            </section>
          </Reveal>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-fd-border bg-fd-card p-4">
      <div className="font-display text-2xl font-semibold text-fd-primary">
        {children}
      </div>
      <div className="mt-1 text-xs text-fd-muted-foreground">{label}</div>
    </div>
  );
}
