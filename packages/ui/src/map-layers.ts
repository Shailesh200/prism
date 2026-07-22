import type { MapLayerDescriptor, MapLayerId } from "@prism/shared";

export type LayerSignalScores = {
  readonly activity: number;
  readonly ownership: number;
  readonly debt: number;
  readonly risk: number;
  readonly performance: number;
  readonly coverage: number;
};

/** Design-system tint tokens per heat layer. */
export const LAYER_TINT: Record<
  Exclude<MapLayerId, "architecture" | "dependency">,
  { css: string; legend: string }
> = {
  activity: { css: "activity", legend: "#D97706" },
  ownership: { css: "ownership", legend: "#5A6B76" },
  debt: { css: "debt", legend: "#E11D48" },
  risk: { css: "risk", legend: "#F59E0B" },
  performance: { css: "performance", legend: "#00C2C2" },
  coverage: { css: "coverage", legend: "#10B981" },
};

export function parseLayerSignals(
  attrs: Record<string, unknown> | undefined,
): LayerSignalScores | null {
  const raw = attrs?.layerSignals;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (k: string) =>
    typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : 0;
  return {
    activity: num("activity"),
    ownership: num("ownership"),
    debt: num("debt"),
    risk: num("risk"),
    performance: num("performance"),
    coverage: num("coverage"),
  };
}

/** Dominant heat for styling when multiple heat layers are active. */
export function dominantHeat(
  signals: LayerSignalScores | null,
  active: readonly MapLayerId[],
): { layer: MapLayerId; value: number } | null {
  if (!signals) return null;
  let best: { layer: MapLayerId; value: number } | null = null;
  for (const id of active) {
    if (id === "architecture" || id === "dependency") continue;
    const value = signals[id as keyof LayerSignalScores];
    if (typeof value !== "number") continue;
    if (!best || value > best.value) best = { layer: id, value };
  }
  return best;
}

export function heatBand(value: number): "0" | "1" | "2" | "3" {
  if (value < 0.25) return "0";
  if (value < 0.5) return "1";
  if (value < 0.75) return "2";
  return "3";
}

export function toggleLayer(
  active: readonly MapLayerId[],
  id: MapLayerId,
): MapLayerId[] {
  if (active.includes(id)) {
    const next = active.filter((x) => x !== id);
    // Always keep at least architecture so the map never goes blank.
    return next.length > 0 ? next : ["architecture"];
  }
  return [...active, id];
}

export function layerLegendItems(
  layers: readonly MapLayerDescriptor[],
  active: readonly MapLayerId[],
): Array<{ id: MapLayerId; label: string; color: string; stub: boolean }> {
  return layers
    .filter((l) => active.includes(l.id) && l.id !== "architecture")
    .map((l) => ({
      id: l.id,
      label: l.label,
      stub: l.stub,
      color:
        l.id === "dependency"
          ? "#00C2C2"
          : (LAYER_TINT[l.id as keyof typeof LAYER_TINT]?.legend ?? "#94A3B8"),
    }));
}
