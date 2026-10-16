import { InfoCallout } from "@/components/paper/blocks";
import { Shell } from "@/components/paper/shell";
import sample from "@/data/benchmarks-sample.json";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Benchmarks",
  description: "Tool-call savings from Prism’s benchmark sample. No repository names.",
  path: "/benchmarks",
});

type Side = { toolCalls: number };
type Scenario = {
  scenario: string;
  label: string;
  withoutPrism: Side;
  withPrism: Side;
};

const QUESTIONS: Record<string, string> = {
  orient: "What is this repository?",
  safe_edit: "Is this edit safe?",
  health: "Is this codebase healthy?",
  find: "Where is this symbol?",
  test_impact: "Which tests reach this file?",
  cycles: "Where are the cycles?",
};

function rows() {
  const buckets = new Map<string, { label: string; without: number; withPrism: number }>();
  for (const fixture of sample.fixtures as Array<{ scenarios: Scenario[] }>) {
    for (const scenario of fixture.scenarios) {
      const current = buckets.get(scenario.scenario) ?? {
        label: QUESTIONS[scenario.scenario] ?? scenario.label,
        without: 0,
        withPrism: 0,
      };
      current.without += scenario.withoutPrism.toolCalls;
      current.withPrism += scenario.withPrism.toolCalls;
      buckets.set(scenario.scenario, current);
    }
  }
  return [...buckets.entries()].map(([id, value]) => {
    const saved = value.without === 0 ? 0 : Math.round(((value.without - value.withPrism) / value.without) * 100);
    return { id, ...value, saved };
  });
}

export default function BenchmarksPage() {
  const all = rows();
  const totals = sample.totals;
  const saved = totals.savings.toolCallsPct;

  return (
    <Shell>
      <section style={{ padding: "80px 0 56px" }}>
        <div className="wrap">
          <div className="eyebrow">Benchmarks</div>
          <h1 className="d1" style={{ margin: "18px 0 22px", maxWidth: 900 }}>
            What we measured, <em>in plain words.</em>
          </h1>
          <p className="lede">
            The checked-in sample compares a simulated read-and-search pass with the same questions answered through Prism. The number that holds up is tool calls.
          </p>
        </div>
      </section>
      <section className="sec">
        <div className="wrap">
          <h2 className="d3" style={{ marginBottom: 28 }}>
            The headline numbers
          </h2>
          <div className="grid4">
            <div className="card fx">
              <div className="eyebrow">Tool calls</div>
              <div className="num" style={{ marginTop: 14, fontSize: 52 }}>
                {saved}%
              </div>
              <p style={{ color: "var(--ink)" }}>Fewer tool calls with Prism than without, across the whole sample.</p>
            </div>
            <div className="card fx">
              <div className="eyebrow">Without</div>
              <div className="num" style={{ marginTop: 14, fontSize: 52 }}>
                {totals.withoutPrism.toolCalls}
              </div>
              <p>Tool calls in the simulated pass.</p>
            </div>
            <div className="card fx">
              <div className="eyebrow">With Prism</div>
              <div className="num" style={{ marginTop: 14, fontSize: 52 }}>
                {totals.withPrism.toolCalls}
              </div>
              <p>Tool calls when the same questions go through Prism.</p>
            </div>
            <div className="card fx">
              <div className="eyebrow">Questions</div>
              <div className="num" style={{ marginTop: 14, fontSize: 52 }}>
                {all.length}
              </div>
              <p>Question types in the sample, summed across every fixture.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap grid2" style={{ alignItems: "start", gridTemplateColumns: "minmax(0,.62fr) minmax(0,1.38fr)" }}>
          <div>
            <h2 className="d3">Every question</h2>
            <p className="lede" style={{ marginTop: 14, fontSize: 18 }}>
              Tool calls only. Token and time totals in this sample are not a saving, so they are not shown as one.
            </p>
          </div>
          <div className="card" style={{ padding: "8px 24px" }}>
            <div className="table-scroll">
              <table className="t">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Fewer calls</th>
                    <th>What it means</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <b style={{ fontWeight: 600 }}>{row.label}</b>
                      </td>
                      <td>
                        <span style={{ font: "500 16px var(--mono)", color: "var(--ink)", whiteSpace: "nowrap" }}>{row.saved}%</span>
                      </td>
                      <td>
                        {row.withPrism} calls with Prism, {row.without} without. <span style={{ color: "var(--ink3)" }}>Your agent starts from an answer instead of a search.</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap">
          <div style={{ maxWidth: 860 }}>
            <InfoCallout title="How to read these numbers">
              They come from Prism’s own benchmark sample, included with the website, run on one macOS machine. They are not an independent audit. The sample does not name a repository on this page. Token and elapsed-time totals in the same file went up, not down, so this page does not quote them as savings.
            </InfoCallout>
          </div>
        </div>
      </section>
    </Shell>
  );
}
