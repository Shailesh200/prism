import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { PageEnter } from "@/components/motion/PageEnter";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { McpInstallPanel } from "@/components/mcp-install-panel";
import type { Metadata } from "next";
import sampleReport from "@/data/benchmarks-sample.json";

export const metadata: Metadata = {
  title: "Benchmarks",
  description:
    "Agent orientation savings with Prism — tool calls and token estimates on fixture repos.",
};

type BenchReport = {
  recordedAt: string;
  totals: {
    withoutPrism: {
      toolCalls: number;
      estimatedTokens: number;
      elapsedMs: number;
    };
    withPrism: {
      toolCalls: number;
      estimatedTokens: number;
      elapsedMs: number;
    };
    savings: { toolCallsPct: number; tokensPct: number; timePct: number };
  };
  fixtures: Array<{
    id: string;
    editTarget: string;
    scenarios: Array<{
      label: string;
      savings: { toolCallsPct: number; tokensPct: number; timePct: number };
    }>;
  }>;
};

async function loadLatestReport(): Promise<BenchReport | null> {
  return sampleReport as BenchReport;
}

export default async function BenchmarksPage() {
  const report = await loadLatestReport();

  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-16">
          <SectionIntro
            index="Nº PROOF"
            title="Benchmarks"
            description="Structural intelligence before an edit — measured on three fixture repos with deterministic proxy costs."
          />

          <Reveal>
            <section className="space-y-4 text-fd-muted-foreground">
              <h2 className="font-display text-xl font-medium text-fd-foreground">
                Methodology
              </h2>
              <ul className="list-disc space-y-2 pl-5 leading-relaxed">
                <li>
                  Two questions per repo:{" "}
                  <strong>What is this repository?</strong> and{" "}
                  <strong>Is this edit safe?</strong>
                </li>
                <li>
                  <strong>Without Prism</strong> — simulated naive agent: list
                  directories, read manifests, scan files for imports.
                </li>
                <li>
                  <strong>With Prism</strong> — Core SDK calls matching MCP
                  tools (<code className="text-fd-primary">repository_dna</code>
                  , <code className="text-fd-primary">repository_overview</code>
                  , <code className="text-fd-primary">blast_radius</code>).
                </li>
                <li>
                  Token estimate = bytes read ÷ 4 (common LLM heuristic). Re-run
                  locally:{" "}
                  <code className="text-fd-primary">
                    bun run bench:orientation
                  </code>
                </li>
              </ul>
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
                  })}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Stat
                    label="Tool calls saved"
                    value={`${report.totals.savings.toolCallsPct}%`}
                  />
                  <Stat
                    label="Fewer agent steps"
                    value={`${report.totals.withoutPrism.toolCalls} → ${report.totals.withPrism.toolCalls}`}
                  />
                </div>
                <p className="text-sm text-fd-muted-foreground">
                  On small fixtures, structured Prism responses can carry more
                  bytes than skimming a few files — the win is fewer tool
                  round-trips and complete structural answers. Token savings
                  widen on larger repos where naive import scans scale with file
                  count.
                </p>
                <div className="overflow-x-auto rounded-lg border border-fd-border">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-fd-border bg-fd-card">
                      <tr>
                        <th className="px-4 py-3 font-medium">Fixture</th>
                        <th className="px-4 py-3 font-medium">Scenario</th>
                        <th className="px-4 py-3 font-medium">Calls saved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.fixtures.flatMap((fixture) =>
                        fixture.scenarios.map((scenario) => (
                          <tr
                            key={`${fixture.id}-${scenario.label}`}
                            className="border-b border-fd-border last:border-0"
                          >
                            <td className="px-4 py-3 font-mono text-xs">
                              {fixture.id}
                            </td>
                            <td className="px-4 py-3">{scenario.label}</td>
                            <td className="px-4 py-3 text-fd-primary">
                              −{scenario.savings.toolCallsPct}%
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-fd-muted-foreground">
                  Totals: {report.totals.withoutPrism.toolCalls} naive calls →{" "}
                  {report.totals.withPrism.toolCalls} Prism calls
                </p>
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
    </HomeLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-fd-border bg-fd-card p-4">
      <div className="font-display text-2xl font-semibold text-fd-primary">
        {value}
      </div>
      <div className="mt-1 text-xs text-fd-muted-foreground">{label}</div>
    </div>
  );
}
