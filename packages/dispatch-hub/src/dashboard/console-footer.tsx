import type { ReactElement } from "react";

const SITE = "https://www.prismhq.in";
const PLAYGROUND = "http://127.0.0.1:5173";

const LINKS: readonly {
  href: string;
  label: string;
  sameTab?: boolean;
}[] = [
  { href: `${PLAYGROUND}/#/dna`, label: "Repo DNA" },
  { href: `${PLAYGROUND}/#/overview`, label: "Health" },
  { href: `${SITE}/docs`, label: "Docs" },
  { href: SITE, label: "Prism" },
  { href: "#/whats-new", label: "What's new", sameTab: true },
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
          <a
            key={link.href}
            href={link.href}
            {...(link.sameTab ? {} : { target: "_blank", rel: "noreferrer" })}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
