import type { ReactElement } from "react";

const SITE = "https://www.prismhq.in";
export const PLAYGROUND_DEFAULT = "http://prismhq.localhost:17331";

export function spectrumUrl(
  base: string,
  opts?: { readonly root?: string; readonly hash?: string },
): string {
  const origin = (base || PLAYGROUND_DEFAULT).replace(/\/$/, "");
  const url = new URL(`${origin}/`);
  const root = opts?.root?.trim();
  if (root && root !== "all") url.searchParams.set("root", root);
  let hash = opts?.hash?.trim() ?? "";
  if (hash && !hash.startsWith("#")) hash = `#/${hash.replace(/^\/+/, "")}`;
  if (hash) url.hash = hash;
  return url.toString();
}

export type ConsoleFooterLink = {
  readonly href?: string;
  readonly label: string;
  readonly sameTab?: boolean;
  readonly onClick?: () => void;
};

export function consoleFooterLinks(props: {
  readonly playgroundUrl?: string;
  readonly repoRoot?: string;
  readonly onCheckUpdates?: () => void;
}): readonly ConsoleFooterLink[] {
  const playground = props.playgroundUrl ?? PLAYGROUND_DEFAULT;
  return [
    {
      href: spectrumUrl(playground, {
        hash: "#/dna",
        ...(props.repoRoot ? { root: props.repoRoot } : {}),
      }),
      label: "Repo DNA",
    },
    {
      href: spectrumUrl(playground, {
        ...(props.repoRoot ? { root: props.repoRoot } : {}),
        hash: "#/overview",
      }),
      label: "Health",
    },
    { href: "#/wake", label: "Wake", sameTab: true },
    { href: `${SITE}/docs`, label: "Docs" },
    ...(props.onCheckUpdates
      ? [{ label: "Check for updates", onClick: props.onCheckUpdates }]
      : []),
    { href: SITE, label: "Prism" },
    { href: "#/whats-new", label: "What's new", sameTab: true },
  ];
}

export function ConsoleFooter(props: {
  readonly version?: string;
  readonly playgroundUrl?: string;
  readonly repoRoot?: string;
  readonly onCheckUpdates?: () => void;
}): ReactElement {
  const links = consoleFooterLinks({
    ...(props.playgroundUrl ? { playgroundUrl: props.playgroundUrl } : {}),
    ...(props.repoRoot ? { repoRoot: props.repoRoot } : {}),
    ...(props.onCheckUpdates ? { onCheckUpdates: props.onCheckUpdates } : {}),
  });
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
        {links.map((link) =>
          link.onClick ? (
            <button
              key={link.label}
              type="button"
              className="console-footer__link"
              onClick={link.onClick}
            >
              {link.label}
            </button>
          ) : (
            <a
              key={link.href}
              className="console-footer__link"
              href={link.href}
              {...(link.sameTab ? {} : { target: "_blank", rel: "noreferrer" })}
            >
              {link.label}
            </a>
          ),
        )}
      </nav>
    </footer>
  );
}
