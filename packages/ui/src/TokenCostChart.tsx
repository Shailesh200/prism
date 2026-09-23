import { useRef, useState, type ReactElement } from "react";
import { Accordion } from "./Accordion.js";
import { AreaChart } from "./ChartPrimitives.js";
import { chartTipEdge, seriesGeometry } from "./charts.js";

export type TokenDayBucket = {
  readonly dayKey: string;
  readonly totalTokens: number;
  readonly jobCount: number;
};

export type TokenCostMark = {
  readonly dayKey: string;
  readonly title: string;
  readonly tokens: number;
};

export type TokenCostChartProps = {
  readonly buckets: readonly TokenDayBucket[];
  readonly days: number;
  readonly total: number;
  readonly jobCount: number;
  readonly rangeNote?: string;
  readonly peak?: TokenCostMark;
  readonly low?: TokenCostMark;
  readonly defaultOpen?: boolean;
  /** Skip the accordion chrome when the chart already sits in a titled card. */
  readonly plain?: boolean;
};

/** `1234` -> "1.2k". Same digits as the Jobs token readout. */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function costDayLabel(dayKey: string): string {
  const parts = dayKey.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return dayKey;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * Daily token sparkline extracted from Pulse (M-078). Trends and Pulse both
 * import this — do not copy a second chart.
 */
export function TokenCostChart(props: TokenCostChartProps): ReactElement {
  const width = 600;
  const height = 56;
  const pad = 4;
  const values = props.buckets.map((b) => b.totalTokens);
  const geo = seriesGeometry(values, width, height, pad);
  const plotRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | undefined>();

  const peakIndex = props.peak
    ? props.buckets.findIndex((b) => b.dayKey === props.peak?.dayKey)
    : -1;
  const lowIndex = props.low
    ? props.buckets.findIndex((b) => b.dayKey === props.low?.dayKey)
    : -1;

  function indexFromClientX(clientX: number): number | undefined {
    const el = plotRef.current;
    if (!el || props.buckets.length === 0) return undefined;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return undefined;
    const fraction = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );
    return Math.round(fraction * (props.buckets.length - 1));
  }

  const hoverBucket =
    hoverIndex != null ? props.buckets[hoverIndex] : undefined;
  const hoverPoint = hoverIndex != null ? geo.points[hoverIndex] : undefined;
  const tipEdge = hoverPoint ? chartTipEdge(hoverPoint[0] / width) : undefined;

  const head = (
    <span className="prism-token-cost__head">
      <span className="prism-token-cost__label">
        Token usage · last {props.days} day{props.days === 1 ? "" : "s"}
        {props.rangeNote ? ` (${props.rangeNote})` : ""}
      </span>
      <span className="prism-token-cost__total">
        {formatTokenCount(props.total)} tokens · {props.jobCount} job
        {props.jobCount === 1 ? "" : "s"}
      </span>
    </span>
  );

  const plot = (
    <div
      ref={plotRef}
      className="prism-token-cost__plot"
      onMouseMove={(event) => setHoverIndex(indexFromClientX(event.clientX))}
      onMouseLeave={() => setHoverIndex(undefined)}
    >
      <AreaChart
        values={values}
        width={width}
        height={height}
        pad={pad}
        className="prism-token-cost__chart"
        label={`Daily token usage over the last ${props.days} day${props.days === 1 ? "" : "s"}${props.rangeNote ? ` (${props.rangeNote})` : ""}`}
      />
      {peakIndex >= 0 && geo.points[peakIndex] && props.peak ? (
        <span
          className="prism-token-cost__mark prism-token-cost__mark--peak"
          style={{
            left: `${(geo.points[peakIndex][0] / width) * 100}%`,
            top: `${(geo.points[peakIndex][1] / height) * 100}%`,
          }}
          title={`Most tokens: "${props.peak.title}" · ${formatTokenCount(props.peak.tokens)} on ${costDayLabel(props.peak.dayKey)}`}
        />
      ) : null}
      {lowIndex >= 0 && geo.points[lowIndex] && props.low ? (
        <span
          className="prism-token-cost__mark prism-token-cost__mark--low"
          style={{
            left: `${(geo.points[lowIndex][0] / width) * 100}%`,
            top: `${(geo.points[lowIndex][1] / height) * 100}%`,
          }}
          title={`Least tokens: "${props.low.title}" · ${formatTokenCount(props.low.tokens)} on ${costDayLabel(props.low.dayKey)}`}
        />
      ) : null}
      {hoverBucket && hoverPoint ? (
        <>
          <span
            className="prism-token-cost__crosshair"
            style={{ left: `${(hoverPoint[0] / width) * 100}%` }}
            aria-hidden
          />
          <span
            className={
              tipEdge === "end"
                ? "prism-token-cost__tooltip prism-token-cost__tooltip--end"
                : tipEdge === "start"
                  ? "prism-token-cost__tooltip prism-token-cost__tooltip--start"
                  : "prism-token-cost__tooltip"
            }
            style={{ left: `${(hoverPoint[0] / width) * 100}%` }}
          >
            <strong>{costDayLabel(hoverBucket.dayKey)}</strong>
            <span>
              {formatTokenCount(hoverBucket.totalTokens)} tokens ·{" "}
              {hoverBucket.jobCount} job
              {hoverBucket.jobCount === 1 ? "" : "s"}
            </span>
          </span>
        </>
      ) : null}
    </div>
  );

  if (props.plain) {
    return (
      <div className="prism-token-cost prism-token-cost--plain">
        {head}
        {plot}
      </div>
    );
  }

  return (
    <Accordion
      className="prism-token-cost"
      {...(props.defaultOpen ? { defaultOpen: true } : {})}
      summary={head}
    >
      {plot}
    </Accordion>
  );
}
