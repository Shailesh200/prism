import { Shell } from "@/components/paper/shell";
import { DataTable } from "@/components/paper/blocks";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy",
  description:
    "Analysis stays on your machine. Prism keeps its library in ~/.prism, outside the checkout.",
  path: "/privacy",
});

const STORE: string[][] = [
  ["~/.prism/workspaces/<key>/cache/", "The index for that repository"],
  [
    "~/.prism/workspaces/<key>/dispatch/",
    "Jobs, memories and notes for that repository",
  ],
  ["~/.prism/dispatch/skills/", "Skills use_skill can load"],
  [
    "~/.prism/envelope-ledger.jsonl",
    "Intelligence call receipts: tool, counts, truncation, bytes. Never source",
  ],
];

export default function PrivacyPage() {
  return (
    <Shell>
      <section style={{ padding: "80px 0 48px" }}>
        <div className="wrap grid2" style={{ alignItems: "end" }}>
          <div>
            <div className="eyebrow">Privacy</div>
            <h1 className="d1" style={{ margin: "18px 0 0" }}>
              Your code <em>stays home.</em>
            </h1>
          </div>
          <p className="lede">
            No account and no telemetry in the product. Prism reads your repo on
            your machine and keeps its library in <code>~/.prism/</code>.
            Production does not write a <code>.prism</code> directory inside the
            checkout. <code>PRISM_HOME</code> moves the library.
          </p>
        </div>
      </section>
      <section className="sec">
        <div className="wrap grid3">
          <div className="card">
            <h2 className="t">Local analysis</h2>
            <p>
              The map, blast radius and review run on your machine. Analysis has
              no model.
            </p>
          </div>
          <div className="card">
            <h2 className="t">No product telemetry</h2>
            <p>
              This release does not phone home for a daily version check. There
              is no <code>PRISM_SKIP_SELF_UPDATE</code> switch because that
              check is not in the code.
            </p>
          </div>
          <div className="card">
            <h2 className="t">Tested</h2>
            <p>
              A test runs the analysis surface with the socket layer trapped.
              Optional features that can use the network stay off until you turn
              them on. None of them send source.
            </p>
          </div>
        </div>
      </section>
      <section className="sec">
        <div
          className="wrap grid2"
          style={{
            alignItems: "start",
            gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr)",
          }}
        >
          <div>
            <h2 className="d3">What is stored</h2>
            <p className="lede" style={{ fontSize: 18, marginTop: 14 }}>
              All under <code>~/.prism/</code>. Delete that folder to remove the
              library. It is outside the checkout.
            </p>
          </div>
          <div className="card" style={{ padding: "8px 24px" }}>
            <DataTable headers={["Path", "What"]} rows={STORE} />
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap">
          <div className="callout" style={{ maxWidth: 820 }}>
            This website, not the Prism engine, records page views with
            first-party Pulse. That is separate from repository analysis.
          </div>
        </div>
      </section>
    </Shell>
  );
}
