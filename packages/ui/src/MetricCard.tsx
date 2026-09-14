import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { CardIconTone } from "./CardIcon.js";
import { Tooltip } from "./Tooltip.js";

export type MetricCardVariant = "wash" | "panel" | "muted" | "brand";
export type MetricCardDensity = "compact" | "regular";

export type MetricCardProps = {
  readonly label: string;
  readonly value: ReactNode;
  readonly unit?: string;
  readonly sub?: string;
  readonly subTone?: "safe" | "muted" | "brand";
  readonly valueTone?: "brand" | "ink";
  readonly icon?: LucideIcon;
  readonly tone?: CardIconTone;
  readonly variant?: MetricCardVariant;
  readonly density?: MetricCardDensity;
  /** Explainer for the info tip. Hidden when empty or `showTooltip` is false. */
  readonly tooltip?: string;
  readonly showTooltip?: boolean;
  readonly className?: string;
  /** Extra inline styles for one-off background/layout overrides. */
  readonly style?: CSSProperties;
};

/**
 * Shared KPI tile: icon + label on the left, value on the right, optional
 * info tip pinned to the top-right corner. Used across Console tabs.
 */
export function MetricCard(props: MetricCardProps): ReactElement {
  const tone = props.tone ?? "brand";
  const variant = props.variant ?? "wash";
  const density = props.density ?? "regular";
  const showTip = (props.showTooltip ?? true) && Boolean(props.tooltip?.trim());
  const Icon = props.icon;
  const iconSize = density === "compact" ? 16 : 14;
  const classes = ["prism-metric-card", props.className]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classes}
      data-tone={tone}
      data-variant={variant}
      data-density={density}
      data-tip={showTip ? "true" : "false"}
      data-icon={Icon ? "true" : "false"}
      style={props.style}
    >
      {showTip ? (
        <span className="prism-metric-card__tip">
          <Tooltip label={props.label} wide align="end">
            {props.tooltip}
          </Tooltip>
        </span>
      ) : null}
      {Icon ? (
        <span className="prism-metric-card__icon" data-tone={tone}>
          <Icon size={iconSize} aria-hidden />
        </span>
      ) : null}
      <div className="prism-metric-card__copy">
        <div className="prism-metric-card__label">{props.label}</div>
        {props.sub ? (
          <div
            className="prism-metric-card__sub"
            data-tone={props.subTone ?? "muted"}
          >
            {props.sub}
          </div>
        ) : null}
      </div>
      <div className="prism-metric-card__metric">
        <div
          className="prism-metric-card__value"
          data-tone={props.valueTone ?? "ink"}
        >
          <span>{props.value}</span>
          {props.unit ? (
            <span className="prism-metric-card__unit">{props.unit}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
