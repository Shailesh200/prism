/**
 * Squarified treemap for Bundle Weight — filename labels, brush-to-zoom.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TreemapDatum = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** Preformatted size (e.g. "12.4 KB") for hover strip. */
  readonly valueLabel?: string;
};

type Rect = { x: number; y: number; w: number; h: number; item: TreemapDatum };

function layoutSquarify(
  items: readonly TreemapDatum[],
  x: number,
  y: number,
  w: number,
  h: number,
): Rect[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || w <= 0 || h <= 0 || items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const rects: Rect[] = [];

  const layout = (
    list: TreemapDatum[],
    rx: number,
    ry: number,
    rw: number,
    rh: number,
  ): void => {
    if (list.length === 0 || rw <= 0 || rh <= 0) return;
    if (list.length === 1) {
      rects.push({ x: rx, y: ry, w: rw, h: rh, item: list[0]! });
      return;
    }
    const sum = list.reduce((s, i) => s + i.value, 0);
    const vertical = rw >= rh;
    let acc = 0;
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      acc += list[i]!.value;
      const side = vertical ? (acc / sum) * rw : (acc / sum) * rh;
      let worst = 0;
      for (let j = 0; j <= i; j++) {
        const frac = list[j]!.value / acc;
        const a = vertical ? side : rw * frac;
        const b = vertical ? rh * frac : side;
        const ratio = Math.max(a / Math.max(b, 1e-6), b / Math.max(a, 1e-6));
        worst = Math.max(worst, ratio);
      }
      if (worst <= bestScore) {
        bestScore = worst;
        bestIdx = i;
      } else {
        break;
      }
    }
    const row = list.slice(0, bestIdx + 1);
    const rest = list.slice(bestIdx + 1);
    const rowSum = row.reduce((s, i) => s + i.value, 0);
    if (vertical) {
      const rowW = (rowSum / sum) * rw;
      let cy = ry;
      for (const item of row) {
        const ih = (item.value / rowSum) * rh;
        rects.push({ x: rx, y: cy, w: rowW, h: ih, item });
        cy += ih;
      }
      layout(rest, rx + rowW, ry, rw - rowW, rh);
    } else {
      const rowH = (rowSum / sum) * rh;
      let cx = rx;
      for (const item of row) {
        const iw = (item.value / rowSum) * rw;
        rects.push({ x: cx, y: ry, w: iw, h: rowH, item });
        cx += iw;
      }
      layout(rest, rx, ry + rowH, rw, rh - rowH);
    }
  };

  layout(sorted, x, y, w, h);
  return rects;
}

/** Low-chroma fills on dark panel — distinct chunks without neon tiles. */
const PALETTE = [
  "color-mix(in srgb, var(--prism-brand) 34%, #1a2332)",
  "color-mix(in srgb, #64748b 40%, #1a2332)",
  "color-mix(in srgb, #6b7c3e 38%, #1a2332)",
  "color-mix(in srgb, var(--prism-amber) 30%, #1a2332)",
  "color-mix(in srgb, var(--prism-rose) 28%, #1a2332)",
  "color-mix(in srgb, var(--prism-emerald) 32%, #1a2332)",
  "color-mix(in srgb, #7a8b9a 36%, #1a2332)",
  "color-mix(in srgb, var(--prism-brand) 24%, #243044)",
];

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

function hitTest(rects: readonly Rect[], x: number, y: number): Rect | null {
  return (
    rects.find(
      (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
    ) ?? null
  );
}

export type BundleTreemapProps = {
  readonly items: readonly TreemapDatum[];
  readonly selectedId?: string | null;
  readonly onSelect?: (id: string) => void;
  /** Total chunks in the full report (for “Showing X / Y”). */
  readonly totalCount?: number;
};

export function BundleTreemap(props: BundleTreemapProps): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 720, h: 360 });
  const [zoomIds, setZoomIds] = useState<string[] | null>(null);
  const [brush, setBrush] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dragging = useRef(false);
  const startPt = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = (): void => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      // Taller map when many chunks so small tiles stay clickable.
      const n = props.items.length;
      const h = Math.min(520, Math.max(320, 280 + Math.min(n, 40) * 4));
      setSize({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.items.length]);

  // Reset zoom when the underlying item set identity changes (new analyze).
  useEffect(() => {
    setZoomIds(null);
    setHoverId(null);
  }, [props.items]);

  const visibleItems = useMemo(() => {
    if (!zoomIds || zoomIds.length === 0) return props.items;
    const set = new Set(zoomIds);
    const filtered = props.items.filter((i) => set.has(i.id));
    return filtered.length > 0 ? filtered : props.items;
  }, [props.items, zoomIds]);

  const rects = useMemo(
    () => layoutSquarify(visibleItems, 0, 0, size.w, size.h),
    [visibleItems, size.w, size.h],
  );

  const visibleTotal = useMemo(
    () => visibleItems.reduce((s, i) => s + i.value, 0),
    [visibleItems],
  );

  const hoverItem = useMemo(() => {
    if (!hoverId) return null;
    return visibleItems.find((i) => i.id === hoverId) ?? null;
  }, [hoverId, visibleItems]);

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const svg = el.querySelector("svg");
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / Math.max(r.width, 1)) * size.w;
    const y = ((clientY - r.top) / Math.max(r.height, 1)) * size.h;
    return { x, y };
  }, [size.h, size.w]);

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    setHoverId(null);
    const p = toLocal(e.clientX, e.clientY);
    startPt.current = p;
    setBrush({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const p = toLocal(e.clientX, e.clientY);
    if (dragging.current && startPt.current) {
      setBrush({
        x0: startPt.current.x,
        y0: startPt.current.y,
        x1: p.x,
        y1: p.y,
      });
      return;
    }
    const hit = hitTest(rects, p.x, p.y);
    setHoverId(hit?.item.id ?? null);
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = toLocal(e.clientX, e.clientY);
    const origin = startPt.current;
    startPt.current = null;
    setBrush(null);
    if (!origin) return;
    const box = {
      x: Math.min(origin.x, p.x),
      y: Math.min(origin.y, p.y),
      w: Math.abs(p.x - origin.x),
      h: Math.abs(p.y - origin.y),
    };
    // Tiny drag = click → select under cursor
    if (box.w < 6 && box.h < 6) {
      const hit = hitTest(rects, p.x, p.y);
      if (hit) {
        props.onSelect?.(hit.item.id);
        setHoverId(hit.item.id);
      }
      return;
    }
    const hits = rects
      .filter((r) => intersects(box, r))
      .map((r) => r.item.id);
    if (hits.length > 0) setZoomIds(hits);
  };

  const onPointerLeave = (): void => {
    if (dragging.current) return;
    setHoverId(null);
  };

  const total = props.totalCount ?? props.items.length;
  const showing = visibleItems.length;
  const zoomed = zoomIds !== null && zoomIds.length > 0;
  const hoverPct =
    hoverItem && visibleTotal > 0
      ? Math.round((hoverItem.value / visibleTotal) * 1000) / 10
      : null;

  if (props.items.length === 0) {
    return (
      <div
        className="bw-treemap bw-treemap--empty"
        role="img"
        aria-label="Empty treemap"
      >
        No chunk sizes to plot
      </div>
    );
  }

  return (
    <div className="bw-treemap-shell" ref={wrapRef}>
      <div className="bw-treemap-toolbar">
        <span className="bw-treemap-toolbar__meta">
          Showing {showing} / {total} chunks
          {zoomed ? " · zoomed" : ""}
          <span className="bw-treemap-toolbar__hint">
            {" "}
            · drag to zoom · click to select
          </span>
        </span>
        {zoomed ? (
          <button
            type="button"
            className="ov-btn ov-btn--ghost bw-treemap-reset"
            onClick={() => setZoomIds(null)}
          >
            Reset zoom
          </button>
        ) : null}
      </div>
      <div
        className={`bw-treemap-hover${hoverItem ? " bw-treemap-hover--active" : ""}`}
        aria-live="polite"
      >
        {hoverItem ? (
          <>
            <span className="bw-treemap-hover__name">{hoverItem.label}</span>
            <span className="bw-treemap-hover__meta ov-mono">
              {hoverItem.valueLabel ?? String(hoverItem.value)}
              {hoverPct !== null ? ` · ${hoverPct}%` : ""}
            </span>
          </>
        ) : (
          <span className="bw-treemap-hover__idle">
            Hover a tile for filename and size
          </span>
        )}
      </div>
      <svg
        className="bw-treemap"
        viewBox={`0 0 ${size.w} ${size.h}`}
        width="100%"
        height={size.h}
        role="img"
        aria-label="Bundle chunks treemap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onPointerCancel={() => {
          dragging.current = false;
          startPt.current = null;
          setBrush(null);
          setHoverId(null);
        }}
      >
        {rects.map((r, i) => {
          const selected = props.selectedId === r.item.id;
          const hovered = hoverId === r.item.id;
          const fill = PALETTE[i % PALETTE.length]!;
          const showLabel = r.w > 48 && r.h > 22;
          const maxChars = Math.max(4, Math.floor(r.w / 7));
          const label =
            r.item.label.length > maxChars
              ? `${r.item.label.slice(0, Math.max(3, maxChars - 1))}…`
              : r.item.label;
          const cellClass = [
            "bw-treemap__cell",
            selected ? "bw-treemap__cell--selected" : "",
            hovered ? "bw-treemap__cell--hover" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <g key={r.item.id} className={cellClass}>
              <rect
                x={r.x + 0.5}
                y={r.y + 0.5}
                width={Math.max(0, r.w - 1)}
                height={Math.max(0, r.h - 1)}
                fill={fill}
                opacity={selected || hovered ? 1 : 0.92}
                rx={2}
                pointerEvents="none"
              />
              {showLabel ? (
                <text
                  x={r.x + 6}
                  y={r.y + 16}
                  className="bw-treemap__label"
                  fill="color-mix(in srgb, var(--prism-ink) 88%, transparent)"
                  pointerEvents="none"
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
        {brush ? (
          <rect
            className="bw-treemap__brush"
            x={Math.min(brush.x0, brush.x1)}
            y={Math.min(brush.y0, brush.y1)}
            width={Math.abs(brush.x1 - brush.x0)}
            height={Math.abs(brush.y1 - brush.y0)}
            pointerEvents="none"
          />
        ) : null}
      </svg>
    </div>
  );
}
