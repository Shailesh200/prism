import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactElement } from "react";

export type CardIconTone =
  | "brand"
  | "violet"
  | "amber"
  | "emerald"
  | "rose"
  | "ink";

export type CardIconProps = {
  readonly icon: LucideIcon;
  readonly tone?: CardIconTone;
  readonly size?: number;
};

const TONE_COLOR: Record<CardIconTone, string> = {
  brand: "var(--prism-brand)",
  violet: "var(--prism-violet)",
  amber: "var(--prism-amber)",
  emerald: "var(--prism-emerald, var(--prism-safe))",
  rose: "var(--prism-rose)",
  ink: "var(--prism-ink)",
};

/**
 * Renders a lucide icon tinted with a design-system tone color. Intended for
 * card-title icons across screens so tone usage stays consistent.
 */
export function CardIcon(props: CardIconProps): ReactElement {
  const { icon: Icon, tone = "brand", size = 16 } = props;
  const style: CSSProperties = { color: TONE_COLOR[tone] };
  return (
    <span className="prism-card-icon" data-tone={tone} style={style}>
      <Icon size={size} aria-hidden />
    </span>
  );
}
