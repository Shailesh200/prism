import { Button } from "@repo-prism/ui";
import type { ReactElement } from "react";

const HIGHLIGHTS = [
  {
    kicker: "Console",
    title: "Append-only job graph",
    body: "Focus draws Accepted → Queued → Working. Pause then resume adds a new Working node; the rail never rewinds.",
  },
  {
    kicker: "Pulse",
    title: "Needs you lives here",
    body: "Live / Needs you / Settled. The extra inbox tab is gone. Related jobs is a parent/child tree.",
  },
  {
    kicker: "MCP",
    title: "prism sleep / prism wake",
    body: "Sleep parks the Console and playground. Wake brings both back and starts the queue.",
  },
] as const;

export function WhatsNewView(props: {
  readonly onOpenPulse: () => void;
  readonly onNewJob: () => void;
}): ReactElement {
  return (
    <section className="console__panel ship-log">
      <p className="console__eyebrow">What's new</p>
      <h1 className="console__title">1.9.0 — Job graph, sleep and wake</h1>
      <p className="console__lede">
        Focus draws an append-only graph. Pulse is the inbox. prism sleep and
        prism wake park and restore the Console.
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
