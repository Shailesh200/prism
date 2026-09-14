import { MetricCard, type CardIconTone } from "@repo-prism/ui";
import { formatTokenCount } from "@repo-prism/app-shell";
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

export const ENVELOPE_DASH = "—";

export type EnvelopeMetricCard = {
  readonly id: string;
  readonly label: string;
  readonly tip: string;
  readonly value: string;
  readonly unit?: string;
  readonly valueTone?: "brand" | "ink";
  readonly sub?: string;
  readonly subTone?: "safe" | "muted" | "brand";
  readonly icon: LucideIcon;
  readonly tone: CardIconTone;
  readonly showTooltip?: boolean;
  readonly variant?: "wash" | "panel" | "muted" | "brand";
};

export function formatEnvelopePercent(
  ratio: number | null,
  digits = 1,
): string {
  if (ratio === null) return ENVELOPE_DASH;
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatEnvelopeDeltaPp(delta: number | null): string {
  if (delta === null) return "";
  const abs = Math.abs(delta).toFixed(1);
  if (delta > 0) return `+${abs}pp`;
  if (delta < 0) return `−${abs}pp`;
  return "0.0pp";
}

export function formatEnvelopeBytes(bytes: number | null): string {
  if (bytes === null) return ENVELOPE_DASH;
  if (bytes >= 1_000_000) {
    const mb = bytes / 1_000_000;
    return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1_000) {
    const kb = bytes / 1_000;
    return `${kb < 10 ? kb.toFixed(1) : String(Math.round(kb))} KB`;
  }
  return `${Math.round(bytes)} B`;
}

export function formatEnvelopeTokens(tokens: number | null): string {
  if (tokens === null || tokens <= 0) return "";
  return `~${formatTokenCount(tokens)}`;
}

export function EnvelopeCards(props: {
  readonly cards: readonly EnvelopeMetricCard[];
  readonly density: "iris" | "detail";
}): ReactElement {
  const count = Math.min(8, Math.max(1, props.cards.length));
  const compact = props.density === "iris";
  return (
    <ul
      className={`envelope-cards envelope-cards--${props.density} envelope-cards--${count}`}
    >
      {props.cards.map((card) => (
        <li key={card.id}>
          <MetricCard
            label={card.label}
            tooltip={card.tip}
            showTooltip={card.showTooltip ?? true}
            value={card.value}
            unit={card.unit}
            valueTone={card.valueTone}
            sub={card.sub}
            subTone={card.subTone}
            icon={card.icon}
            tone={card.tone}
            variant={card.variant ?? (compact ? "wash" : "panel")}
            density={compact ? "compact" : "regular"}
          />
        </li>
      ))}
    </ul>
  );
}
