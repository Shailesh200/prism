import { Button } from "@repo-prism/ui";
import type { ReactElement } from "react";

const HIGHLIGHTS = [
  {
    kicker: "Skills",
    title: "Version history",
    body: "Published skills keep snapshots. Revert, delete, or compare. Edit can Update Skill with teammate instructions.",
  },
  {
    kicker: "Pulse",
    title: "Pause is its own step",
    body: "The status pill matches the last meter step. Worked time excludes pause. Running and paused bars match done height.",
  },
  {
    kicker: "Dashboard",
    title: "Every job, by type",
    body: "Filter Custom job, child jobs, and playbooks. Pulse shows jobs even when the checkout is not in the registry.",
  },
] as const;

export function WhatsNewView(props: {
  readonly onOpenPulse: () => void;
  readonly onNewJob: () => void;
}): ReactElement {
  return (
    <section className="console__panel ship-log">
      <p className="console__eyebrow">What's new</p>
      <h1 className="console__title">
        1.11.1 — Skills history and Pulse meter
      </h1>
      <p className="console__lede">
        Published skills keep versions. Pulse wait, work, and pause match
        last-step status, and Worked no longer includes pause.
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
