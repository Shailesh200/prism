import { Button } from "@repo-prism/ui";
import type { ReactElement } from "react";

const HIGHLIGHTS = [
  {
    kicker: "Console",
    title: "Skills and Trees",
    body: "Skills is a grouped view in ~/.prism, not the repo. Trees shows checkout versus linked worktrees.",
  },
  {
    kicker: "Impact",
    title: "One workspace",
    body: "Explain, Blast radius, and Review changes share a target. Use dirty files on every tab.",
  },
  {
    kicker: "Dispatch",
    title: "Orientation and overlap",
    body: "Teammates start with repo context. Concurrent jobs cannot silently stack on the same paths.",
  },
] as const;

export function WhatsNewView(props: {
  readonly onOpenPulse: () => void;
  readonly onNewJob: () => void;
}): ReactElement {
  return (
    <section className="console__panel ship-log">
      <p className="console__eyebrow">What's new</p>
      <h1 className="console__title">1.10.0 — Skills, trees, and Impact</h1>
      <p className="console__lede">
        Skills and Trees in the Console. Impact is one workspace. Teammates
        start oriented and do not overlap in silence.
      </p>
      <ul className="ship-log__feats">
        {HIGHLIGHTS.map((row) => (
          <li key={row.kicker} className="ship-log__feat">
            <span className="ship-log__kicker">{row.kicker}</span>
            <strong>{row.title}</strong>
            <p>{row.body}</p>
          </li>
        ))}
      </ul>
      <div className="ship-log__actions">
        <Button variant="primary" onClick={props.onNewJob}>
          New job
        </Button>
        <Button variant="secondary" onClick={props.onOpenPulse}>
          Open Pulse
        </Button>
      </div>
      <p className="ship-log__more">
        <a
          href="https://www.prismhq.in/whats-new"
          target="_blank"
          rel="noreferrer"
        >
          Full ship log on prismhq.in
        </a>
      </p>
    </section>
  );
}
