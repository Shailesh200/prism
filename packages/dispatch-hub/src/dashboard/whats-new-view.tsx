import { Button } from "@repo-prism/ui";
import type { ReactElement } from "react";

const HIGHLIGHTS = [
  {
    kicker: "Prepare",
    title: "Ask what to open",
    body: "One call before you edit: pack, reuse, House Style, and a work order. Paths only — never file bodies.",
  },
  {
    kicker: "Envelope",
    title: "A receipt, not a dump",
    body: "Iris shows bytes kept vs dump for Intelligence calls. No source. An empty week is no sessions, never 0%.",
  },
  {
    kicker: "Guard",
    title: "Read the 3% that can hurt",
    body: "Rank this session’s dirty files by blast. Findings stay open until a re-scan drops the fingerprint.",
  },
] as const;

export function WhatsNewView(props: {
  readonly onOpenPulse: () => void;
  readonly onNewJob: () => void;
}): ReactElement {
  return (
    <section className="console__panel ship-log">
      <p className="console__eyebrow">What's new</p>
      <h1 className="console__title">1.12.0 — Envelope, Prepare, Guard</h1>
      <p className="console__lede">
        Prepare before you edit. Envelope proves the chat stayed lean. Guard
        ranks the dirty files that can actually hurt.
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
