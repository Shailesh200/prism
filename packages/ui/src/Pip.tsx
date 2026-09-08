import type { ReactElement } from "react";

export type PipTone =
  | "muted"
  | "brand"
  | "accent"
  | "amber"
  | "emerald"
  | "rose";

export type PipSize = "sm" | "md" | "lg";

export type PipProps = {
  readonly tone?: PipTone;
  readonly size?: PipSize;
  readonly pulse?: boolean;
  readonly className?: string;
};

export function Pip(props: PipProps): ReactElement {
  const tone = props.tone ?? "muted";
  const size = props.size ?? "md";
  const classes = [
    "prism-pip",
    tone === "muted" ? "" : `prism-pip--${tone}`,
    size === "md" ? "" : `prism-pip--${size}`,
    props.pulse ? "prism-pip--pulse" : "",
    props.className,
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={classes} aria-hidden />;
}
