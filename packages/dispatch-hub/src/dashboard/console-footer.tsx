import type { ReactElement } from "react";

const SITE = "https://www.prismhq.in";
export const PLAYGROUND_DEFAULT = "http://prismhq.localhost:17331";

export function ConsoleFooter(props: {
  readonly version?: string;
  readonly playgroundUrl?: string;
}): ReactElement {
  const playground = (props.playgroundUrl ?? PLAYGROUND_DEFAULT).replace(
    /\/$/,
    "",
  );
  const links: readonly {
    href: string;
    label: string;
    sameTab?: boolean;
  }[] = [
    { href: `${playground}/#/dna`, label: "Repo DNA" },
    { href: `${playground}/#/overview`, label: "Health" },
    { href: "#/wake", label: "Wake", sameTab: true },
    { href: `${SITE}/docs`, label: "Docs" },
    { href: SITE, label: "Prism" },
    { href: "#/whats-new", label: "What's new", sameTab: true },
  ];
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
        {links.map((link) => (
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
