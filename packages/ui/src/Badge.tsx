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
};

export function Badge(props: BadgeProps): ReactElement {
  const tone = props.tone ?? "neutral";
  const classes = ["prism-badge", `prism-badge--${tone}`, props.className]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{props.children}</span>;
}
