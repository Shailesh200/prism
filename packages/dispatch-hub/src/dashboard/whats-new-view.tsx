import { Button } from "@repo-prism/ui";
import type { ReactElement } from "react";

const HIGHLIGHTS = [
  {
    kicker: "Console",
    title: "Pulse, Board, List",
    body: "Three views of one jobs canvas. New job is a button. Attention is the inbox for work that needs you.",
  },
  {
    kicker: "Pulse",
    title: "Wait and work",
    body: "Live cards show wait and work as two meters. Billed in/out lives in Focus, not on Pulse.",
  },
  {
    kicker: "MCP",
    title: "Start a job here",
    body: "Compose a brief, pick a playbook, default to checkout. Chat still queues the same teammate.",
  },
] as const;

export function WhatsNewView(props: {
  readonly onOpenPulse: () => void;
  readonly onNewJob: () => void;
}): ReactElement {
  return (
    <section className="console__panel ship-log">
      <p className="console__eyebrow">What's new</p>
      <h1 className="console__title">1.8.0 — Fleet Console</h1>
      <p className="console__lede">
        Pulse, Board, and List are three views of the same jobs canvas. New job
        is a verb on this board, not only a sentence in chat.
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
