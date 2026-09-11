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

/** Nice y-axis tick values covering `[min, max]`. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  let lo = min;
  let hi = max;
  if (hi < lo) {
    const swap = lo;
    lo = hi;
    hi = swap;
  }
  if (hi === lo) {
    if (hi === 0) return [0, 1];
    return lo >= 0 ? [0, hi] : [lo, 0];
  }
  if (lo === 0 && hi === 100) {
    return [0, 25, 50, 75, 100];
  }
  const span = hi - lo;
  const raw = span / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / mag;
  const step = residual >= 5 ? 5 * mag : residual >= 2 ? 2 * mag : mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(8)));
  }
  return ticks.length >= 2 ? ticks : [lo, hi];
}

/** Integer y ticks from 0 to `max` — commit counts, degrees, etc. */
export function integerTicks(max: number, count = 5): number[] {
  const top = Math.max(1, Math.ceil(max));
  if (top <= 4) {
    return Array.from({ length: top + 1 }, (_, i) => i);
  }
  const ticks = niceTicks(0, top, count).map((value) => Math.round(value));
  const unique = [...new Set(ticks)].filter((value) => value >= 0);
  if (unique[0] !== 0) unique.unshift(0);
  const last = unique[unique.length - 1] ?? 0;
  if (last > top) unique[unique.length - 1] = top;
  else if (last < top) unique.push(top);
  const collapsed = [...new Set(unique)];
  // Forcing the last tick to the exact max (11, not 12) can sit it one
  // unit above the previous nice step (10). Drop the crowded neighbour so
  // labels like "10" and "11" do not paint on top of each other.
  if (collapsed.length >= 3) {
    const hi = collapsed[collapsed.length - 1]!;
    const prev = collapsed[collapsed.length - 2]!;
    const prior = collapsed[collapsed.length - 3]!;
    const typical = prev - prior;
    if (typical > 0 && hi - prev < typical * 0.75) {
      collapsed.splice(collapsed.length - 2, 1);
    }
  }
  return collapsed;
}

/** Sparse indices for x-axis labels (always includes first and last). */
export function pickAxisIndices(length: number, maxLabels = 8): number[] {
  if (length <= 0) return [];
  if (length <= maxLabels) {
    return Array.from({ length }, (_, i) => i);
  }
  const inner = maxLabels - 2;
  const out = [0];
  for (let i = 1; i <= inner; i += 1) {
    out.push(Math.round((i * (length - 1)) / (inner + 1)));
  }
  out.push(length - 1);
  return [...new Set(out)];
}

/** SVG y for a domain value, matching {@link seriesGeometry}. */
export function valueToY(
  value: number,
  height: number,
  pad: number,
  min: number,
  max: number,
): number {
  const span = Math.max(1, max - min);
  const frac = Math.max(0, Math.min(1, (value - min) / span));
  return height - pad - frac * (height - pad * 2);
}
