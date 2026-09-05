import { useId, type ReactElement, type ReactNode } from "react";
import { gaugeArc, seriesGeometry } from "./charts.js";

export type SparklineProps = {
  readonly values: readonly number[];
  readonly width?: number;
  readonly height?: number;
  readonly label?: string;
  readonly className?: string;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly pad?: number;
};

export function Sparkline(props: SparklineProps): ReactElement {
  const width = props.width ?? 120;
  const height = props.height ?? 28;
  const geo = seriesGeometry(props.values, width, height, props.pad ?? 2, {
    ...(props.minValue !== undefined ? { min: props.minValue } : {}),
    ...(props.maxValue !== undefined ? { max: props.maxValue } : {}),
  });
  const id = useId().replace(/:/g, "");
  if (geo.points.length === 0) {
    return (
      <svg
        className={props.className ?? "prism-spark"}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-label={props.label ?? "No activity"}
      >
        <line
          x1="2"
          x2={width - 2}
          y1={height / 2}
          y2={height / 2}
          stroke="var(--prism-ink-4)"
          strokeWidth="1"
        />
      </svg>
    );
  }
  return (
    <svg
      className={props.className ?? "prism-spark"}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      aria-label={props.label ?? "Activity"}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="color-mix(in srgb, var(--prism-brand) 35%, transparent)"
          />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <polygon points={geo.area} fill={`url(#${id})`} />
      <polyline
        points={geo.line}
        fill="none"
        stroke="var(--prism-brand)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export type AreaChartProps = SparklineProps;

export function AreaChart(props: AreaChartProps): ReactElement {
  return (
    <Sparkline
      values={props.values}
      width={props.width ?? 600}
      height={props.height ?? 160}
      {...(props.label ? { label: props.label } : {})}
      {...(props.className ? { className: props.className } : {})}
      {...(props.minValue !== undefined ? { minValue: props.minValue } : {})}
      {...(props.maxValue !== undefined ? { maxValue: props.maxValue } : {})}
      {...(props.pad !== undefined ? { pad: props.pad } : {})}
    />
  );
}

export type GaugeProps = {
  readonly score: number;
  readonly label?: string;
};

export function Gauge(props: GaugeProps): ReactElement {
  const score = Math.max(0, Math.min(100, props.score));
  return (
    <svg
      className="prism-gauge"
      viewBox="0 0 80 52"
      width="80"
      height="52"
      aria-label={props.label}
    >
      <path
        d={gaugeArc(100)}
        fill="none"
        stroke="var(--prism-line)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d={gaugeArc(score)}
        fill="none"
        stroke="var(--prism-brand)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type GanttRowProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

/** Track wrapper. Bars are positioned by the caller with ganttSegmentPercents. */
export function GanttRow(props: GanttRowProps): ReactElement {
  return (
    <div
      className={`prism-gantt${props.className ? ` ${props.className}` : ""}`}
    >
      {props.children}
    </div>
  );
}
