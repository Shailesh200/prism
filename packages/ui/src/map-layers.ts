import {
  DEFAULT_PROVENANCE,
  SIGNAL_PROVENANCE,
  type MapLayerDescriptor,
  type MapLayerId,
  type SignalProvenance,
} from "@prism/shared";

/**
 * Layer heat as the map renders it. A layer is absent from `values` when the
 * repository has no data for it — previously it defaulted to `0`, which painted
 * "we don't know" in the same colour ramp as a measured zero (ADR-0029).
 */
export type LayerSignalScores = {
  readonly values: Partial<Record<HeatLayerId, number>>;
  readonly provenance: Partial<Record<HeatLayerId, SignalProvenance>>;
};

export type HeatLayerId = Exclude<MapLayerId, "architecture" | "dependency">;

export const HEAT_LAYER_IDS = [
  "activity",
  "ownership",
  "debt",
  "risk",
  "performance",
  "coverage",
] as const satisfies readonly HeatLayerId[];

/** Design-system tint tokens per heat layer. */
export const LAYER_TINT: Record<HeatLayerId, { css: string; legend: string }> =
  {
    activity: { css: "activity", legend: "#D97706" },
    ownership: { css: "ownership", legend: "#5A6B76" },
    debt: { css: "debt", legend: "#E11D48" },
    risk: { css: "risk", legend: "#F59E0B" },
    performance: { css: "performance", legend: "#00C2C2" },
    coverage: { css: "coverage", legend: "#10B981" },
  };

/** Neutral tone for a layer the repository has no data for. */
export const NO_DATA_LEGEND = "#5A6B76";

const isHeatLayerId = (id: string): id is HeatLayerId =>
  (HEAT_LAYER_IDS as readonly string[]).includes(id);

const isProvenance = (v: unknown): v is SignalProvenance =>
  typeof v === "string" && (SIGNAL_PROVENANCE as readonly string[]).includes(v);

export function parseLayerSignals(
  attrs: Record<string, unknown> | undefined,
): LayerSignalScores | null {
  const raw = attrs?.layerSignals;
  if (!raw || typeof raw !== "object") return null;
  const rawValues = raw as Record<string, unknown>;
  const rawProvenance =
    attrs?.layerProvenance && typeof attrs.layerProvenance === "object"
      ? (attrs.layerProvenance as Record<string, unknown>)
      : {};

  const values: Partial<Record<HeatLayerId, number>> = {};
  const provenance: Partial<Record<HeatLayerId, SignalProvenance>> = {};

  for (const id of HEAT_LAYER_IDS) {
    const declared = rawProvenance[id];
    const p = isProvenance(declared) ? declared : DEFAULT_PROVENANCE;
    provenance[id] = p;
    if (p === "unavailable") continue;
    const v = rawValues[id];
    if (typeof v === "number" && Number.isFinite(v)) {
      values[id] = v;
    } else {
      // A value that should exist but does not is missing data, not zero.
      provenance[id] = "unavailable";
    }
  }

  return { values, provenance };
}

export function signalValue(
  signals: LayerSignalScores | null,
  id: string,
): number | null {
  if (!signals || !isHeatLayerId(id)) return null;
  return signals.values[id] ?? null;
}

export function signalProvenance(
  signals: LayerSignalScores | null,
  id: string,
): SignalProvenance {
  if (!signals || !isHeatLayerId(id)) return "unavailable";
  return signals.provenance[id] ?? "unavailable";
}

/**
 * Dominant heat for styling when multiple heat layers are active, or `null`
 * when none of the active layers have data for this node.
 */
export function dominantHeat(
  signals: LayerSignalScores | null,
  active: readonly MapLayerId[],
): { layer: HeatLayerId; value: number; provenance: SignalProvenance } | null {
  if (!signals) return null;
  let best: {
    layer: HeatLayerId;
    value: number;
    provenance: SignalProvenance;
  } | null = null;
  for (const id of active) {
    if (!isHeatLayerId(id)) continue;
    const value = signals.values[id];
    if (typeof value !== "number") continue;
    if (!best || value > best.value) {
      best = {
        layer: id,
        value,
        provenance: signals.provenance[id] ?? DEFAULT_PROVENANCE,
      };
    }
  }
  return best;
}

/** True when every active heat layer is unavailable for this node. */
export function hasNoHeatData(
  signals: LayerSignalScores | null,
  active: readonly MapLayerId[],
): boolean {
  return dominantHeat(signals, active) === null;
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
