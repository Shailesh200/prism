import {
  createElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Product type scale. One family (Inter), one mono (JetBrains Mono),
 * heading white vs body off-white vs muted meta.
 *
 * title       Page name — Iris, Jobs, Envelope, Prepare (24px / 550)
 * page        Rail screen name — Overview, DNA, Settings (16px / 600)
 * headline    Run or record title — Prepare task (16px / 500)
 * heading     Section — Repository analysis (h2)
 * subheading  Block — Envelope, Prepare, connectors (h3)
 * card        Widget title inside a card
 * section     Table or group label — Pack files, journal (mono, caps)
 * lede        One-line description under a title
 * body        Default prose
 * caption     Hint, subtitle, secondary line
 * label       Uppercase meta — KPI names
 * eyebrow     Brand kicker above a title
 * code        Paths and symbols
 * metric      KPI figure
 */
export const TEXT_VARIANTS = [
  "title",
  "page",
  "headline",
  "heading",
  "subheading",
  "card",
  "section",
  "lede",
  "body",
  "caption",
  "label",
  "eyebrow",
  "code",
  "metric",
] as const;

export type TextVariant = (typeof TEXT_VARIANTS)[number];

const DEFAULT_TAG: Record<TextVariant, keyof HTMLElementTagNameMap> = {
  title: "h1",
  page: "div",
  headline: "p",
  heading: "h2",
  subheading: "h3",
  card: "span",
  section: "h2",
  lede: "p",
  body: "p",
  caption: "p",
  label: "span",
  eyebrow: "p",
  code: "code",
  metric: "span",
};

export type TextProps = HTMLAttributes<HTMLElement> & {
  readonly variant?: TextVariant;
  readonly as?: keyof HTMLElementTagNameMap;
  readonly children?: ReactNode;
};

export function Text(props: TextProps): ReactElement {
  const { variant = "body", as, className, children, ...rest } = props;
  const tag = as ?? DEFAULT_TAG[variant];
  const classes = ["prism-type", `prism-type--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return createElement(tag, { ...rest, className: classes }, children);
}
