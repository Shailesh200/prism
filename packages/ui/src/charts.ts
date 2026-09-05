/**
 * Hand-rolled SVG geometry for Console and Playground charts (M-068).
 * No charting library — M-050 / ADR-0053 §9.
 */

export type ChartPoint = readonly [x: number, y: number];

export type SeriesGeometry = {
  readonly line: string;
  readonly area: string;
  readonly points: readonly ChartPoint[];
};

export function seriesGeometry(
  values: readonly number[],
  width = 120,
  height = 32,
  pad = 2,
  domain?: { readonly min?: number; readonly max?: number },
): SeriesGeometry {
  if (values.length === 0) {
    return { line: "", area: "", points: [] };
  }
  const min = domain?.min ?? 0;
  const max = domain?.max ?? Math.max(1, ...values);
  const span = Math.max(1, max - min);
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values.map((value, index) => {
    const x = pad + index * stepX;
    const frac = Math.max(0, Math.min(1, (value - min) / span));
    const y = height - pad - frac * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const lastX = points[points.length - 1]?.[0] ?? pad;
  const area = `${pad},${height - pad} ${line} ${lastX},${height - pad}`;
  return { line, area, points };
}

export type GanttSegment = {
  readonly startMs: number;
  readonly endMs: number;
  readonly kind: "waited" | "worked";
};

export function ganttSegmentPercents(
  rangeStartMs: number,
  rangeEndMs: number,
  startMs: number,
  endMs: number,
): { readonly left: number; readonly width: number } | undefined {
  const span = Math.max(1, rangeEndMs - rangeStartMs);
  const from = Math.max(rangeStartMs, startMs);
  const to = Math.min(rangeEndMs, endMs);
  if (to <= from) return undefined;
  return {
    left: ((from - rangeStartMs) / span) * 100,
    width: Math.max(0.6, ((to - from) / span) * 100),
  };
}

export function gaugeArc(score: number, radius = 36): string {
  const clamped = Math.max(0, Math.min(100, score));
  const start = Math.PI;
  const end = Math.PI + (clamped / 100) * Math.PI;
  const sx = 40 + radius * Math.cos(start);
  const sy = 44 + radius * Math.sin(start);
  const ex = 40 + radius * Math.cos(end);
  const ey = 44 + radius * Math.sin(end);
  const large = clamped > 50 ? 1 : 0;
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${large} 1 ${ex} ${ey}`;
}
