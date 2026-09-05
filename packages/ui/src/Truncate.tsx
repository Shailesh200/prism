import type { ReactElement, ReactNode } from "react";
import { HoverTip } from "./HoverTip.js";

export type TruncateProps = {
  readonly children: ReactNode;
  /**
   * Tip body (or sole tip text). Prefer a short preview for long briefs —
   * `HoverTip` clamps whatever lands here.
   */
  readonly title: string;
  /** Optional short heading above `title` in the tip (e.g. job name over PRD). */
  readonly heading?: string;
};

/** Clip overflowing copy and show a compact tip on hover. */
export function Truncate(props: TruncateProps): ReactElement {
  const heading = props.heading?.trim();
  return (
    <HoverTip
      label={heading || props.title}
      {...(heading ? { detail: props.title } : {})}
      className="prism-truncate-wrap"
    >
      <span className="prism-truncate">{props.children}</span>
    </HoverTip>
  );
}
