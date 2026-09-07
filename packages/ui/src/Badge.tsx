import type { ReactElement, ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "accent"
  | "emerald"
  | "amber"
  | "rose"
  | "violet";

export type BadgeProps = {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly className?: string;
  /** Live jobs: glow like the in-progress rail node. */
  readonly pulse?: boolean;
};

export function Badge(props: BadgeProps): ReactElement {
  const tone = props.tone ?? "neutral";
  const classes = [
    "prism-badge",
    `prism-badge--${tone}`,
    props.pulse ? "prism-badge--pulse" : "",
    props.className,
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{props.children}</span>;
}
