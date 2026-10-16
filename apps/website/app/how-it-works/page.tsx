import {
  GuardExample,
  MapExample,
  PrepareExample,
  ReviewExample,
} from "@/components/paper/examples";
import { Cta, Shell } from "@/components/paper/shell";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "How it works",
  description:
    "A local index, a prepare step before the edit, and a ranked review after it.",
  path: "/how-it-works",
});

const STEPS = [
  [
    "Map",
    "Prism reads your TypeScript and JavaScript into a local index: files, symbols, imports and tests. The first command that needs the index builds it.",
    <MapExample key="m" />,
  ],
  [
    "Prepare",
    "When you ask for a change, prepare_change adds the files to open, helpers to reuse, House Style and a work order. Never file bodies.",
    <PrepareExample key="p" />,
  ],
  [
    "Guard",
    "guard_session ranks the dirty files by blast. rename_impact and safe_delete list edit sites before anything is written.",
    <GuardExample key="g" />,
  ],
  [
    "Review",
    "review_changes rolls the diff into one risk band and names the tests that reach it. prism review --fail-on can exit 1.",
    <ReviewExample key="r" />,
  ],
] as const;

export default function HowPage() {
  return (
    <Shell>
      <section style={{ padding: "80px 0 64px" }}>
        <div className="wrap">
          <div className="eyebrow">How it works</div>
          <h1 className="d1" style={{ margin: "18px 0 22px", maxWidth: 900 }}>
            A map, a prepare step, <em>and a review.</em>
          </h1>
          <p className="lede">
            Prism runs on your machine next to your agent. It gives the agent
            the right context and ranks the result. It doesn’t write code for
            you. Analysis has no model behind it.
          </p>
        </div>
      </section>
      {STEPS.map(([title, body, visual], index) => (
        <section className="sec" key={title}>
          <div
            className="wrap grid2"
            style={{ gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr)" }}
          >
            <div>
              <div className="eyebrow">Step {index + 1}</div>
              <h2 className="d2" style={{ margin: "12px 0 16px" }}>
                {title}
              </h2>
              <p className="lede">{body}</p>
            </div>
            <div>{visual}</div>
          </div>
        </section>
      ))}
      <section className="sec">
        <div className="wrap grid3">
          <div className="card fx">
            <h3 className="t">Tools for your agent</h3>
            <p>
              Your agent picks them from your words. The server exposes the full
              tool list, including prepare_change, blast_radius, review_changes
              and find_references.
            </p>
          </div>
          <div className="card fx">
            <h3 className="t">Analysis has no model</h3>
            <p>
              Answers come from the local index. Prism is not a coding model.
            </p>
          </div>
          <div className="card fx">
            <h3 className="t">State stays in ~/.prism</h3>
            <p>
              Production does not write a .prism folder into your checkout.
              Per-repo state lives under ~/.prism/workspaces.
            </p>
          </div>
        </div>
      </section>
      <Cta />
    </Shell>
  );
}
