import { Button } from "@repo-prism/ui";
import type { ReactElement } from "react";

const HIGHLIGHTS = [
  {
    kicker: "Jobs",
    title: "One store",
    body: "Jobs live under ~/.prism. Switching checkouts no longer drops rows. Old repo files are lifted, not deleted first.",
  },
  {
    kicker: "Wake",
    title: "Dispatch and Spectrum",
    body: "Wake shows each surface. Close or Escape leaves the page. Spectrum follows the repo you pick.",
  },
  {
    kicker: "Spectrum",
    title: "The repo you chose",
    body: "DNA, Health, and the map stay on the checkout in the URL. A background poll cannot snap you back.",
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
        1.11.0 — Global jobs, Wake, and Spectrum
      </h1>
      <p className="console__lede">
        Jobs survive repo switches. Wake names Dispatch and Spectrum. Spectrum
        keeps the repository you picked.
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
