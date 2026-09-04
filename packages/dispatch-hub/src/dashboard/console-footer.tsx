import type { ReactElement } from "react";

const SITE = "https://www.prismhq.in";
/** Local IDE (playground) — same screens as the editor dashboard. */
const PLAYGROUND = "http://127.0.0.1:5173";

const LINKS: readonly { href: string; label: string }[] = [
  { href: SITE, label: "Website" },
  { href: `${SITE}/docs`, label: "Docs" },
  { href: `${PLAYGROUND}/#/dna`, label: "Repo DNA" },
  { href: `${PLAYGROUND}/#/overview`, label: "Health" },
  { href: `${PLAYGROUND}/#/blast`, label: "Blast radius" },
  { href: `${SITE}/features`, label: "Features" },
  { href: `${SITE}/products`, label: "Products" },
  { href: `${SITE}/whats-new`, label: "What's new" },
];

export function ConsoleFooter(props: {
  readonly version?: string;
}): ReactElement {
  return (
    <footer className="console-footer">
      <div className="console-footer__brand">
        <strong>Prism</strong>
        <span className="console-footer__dispatch">Dispatch</span>
        {props.version ? (
          <span className="console-footer__ver">v{props.version}</span>
        ) : null}
      </div>
      <nav className="console-footer__links" aria-label="Prism">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
