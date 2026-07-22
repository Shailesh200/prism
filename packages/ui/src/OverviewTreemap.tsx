import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { GraphNodeDto, MapLayerId } from "@prism/shared";
import { dominantHeat, LAYER_TINT, parseLayerSignals } from "./map-layers.js";
import { squarifyTreemap, type TreemapItem } from "./overview-treemap.js";

export type OverviewTreemapProps = {
  readonly nodes: readonly GraphNodeDto[];
  readonly activeLayerIds: readonly MapLayerId[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onDrill: (id: string) => void;
  /** "identity" colors each cell distinctly (Feature lens); else by heat. */
  readonly colorBy?: "lens" | "identity";
};

const DBLCLICK_MS = 360;

function weightOf(node: GraphNodeDto): number {
  const w = node.attrs?.weight;
  return typeof w === "number" && w > 0 ? w : 1;
}

function hashHue(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

function cellFill(
  node: GraphNodeDto,
  active: readonly MapLayerId[],
  colorBy: "lens" | "identity",
): { fill: string; ink: string } {
  if (colorBy === "identity") {
    const hue = hashHue(node.id);
    return {
      fill: `color-mix(in srgb, hsl(${hue} 58% 60%) 42%, #ffffff)`,
      ink: "var(--prism-ink)",
    };
  }
  const heat = dominantHeat(
    parseLayerSignals(node.attrs as Record<string, unknown>),
    active,
  );
  if (!heat || heat.value <= 0) {
    return {
      fill: "color-mix(in srgb, var(--prism-brand) 9%, #ffffff)",
      ink: "var(--prism-ink)",
    };
  }
  const legend =
    LAYER_TINT[heat.layer as keyof typeof LAYER_TINT]?.legend ?? "#0F766E";
  const pct = Math.round(18 + Math.min(1, heat.value) * 62);
  return {
    fill: `color-mix(in srgb, ${legend} ${pct}%, #ffffff)`,
    ink: pct >= 62 ? "#ffffff" : "var(--prism-ink)",
  };
}

/**
 * Scalable overview: one squarified cell per node (area ∝ weight, color ∝
 * active lens). Click selects; double-click drills into the node's scope.
 */
export function OverviewTreemap(props: OverviewTreemapProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 960,
    h: 600,
  });
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize({
        w: Math.max(120, Math.floor(box.width)),
        h: Math.max(120, Math.floor(box.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cells = useMemo(() => {
    const items: TreemapItem[] = props.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      weight: weightOf(n),
    }));
    return squarifyTreemap(items, size.w, size.h);
  }, [props.nodes, size.w, size.h]);

  const byId = useMemo(
    () => new Map(props.nodes.map((n) => [n.id, n])),
    [props.nodes],
  );

  const onCellClick = (id: string) => {
    const now = Date.now();
    const prev = lastClickRef.current;
    if (prev && prev.id === id && now - prev.at <= DBLCLICK_MS) {
      lastClickRef.current = null;
      props.onDrill(id);
      return;
    }
    lastClickRef.current = { id, at: now };
    props.onSelect(id);
  };

  return (
    <div className="prism-tmap" ref={hostRef}>
      {cells.map((cell) => {
        const node = byId.get(cell.id);
        if (!node) return null;
        const { fill, ink } = cellFill(
          node,
          props.activeLayerIds,
          props.colorBy ?? "lens",
        );
        const showLabel = cell.w >= 54 && cell.h >= 26;
        const selected = props.selectedId === cell.id;
        return (
          <button
            key={cell.id}
            type="button"
            className="prism-tmap__cell"
            data-selected={selected ? "true" : undefined}
            title={`${cell.label} · ${cell.weight} ${cell.weight === 1 ? "file" : "files"}`}
            style={{
              left: `${(cell.x / size.w) * 100}%`,
              top: `${(cell.y / size.h) * 100}%`,
              width: `${(cell.w / size.w) * 100}%`,
              height: `${(cell.h / size.h) * 100}%`,
              background: fill,
              color: ink,
            }}
            onClick={() => onCellClick(cell.id)}
          >
            {showLabel ? (
              <span className="prism-tmap__label">
                <span className="prism-tmap__name">{cell.label}</span>
                {cell.h >= 44 ? (
                  <span className="prism-tmap__sub">
                    {cell.weight} {cell.weight === 1 ? "file" : "files"}
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
