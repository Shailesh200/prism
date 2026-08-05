import type { MapLayerDescriptor, MapLayerId } from "@repo-prism/shared";

/**
 * Product Map layers (M-017 / M-019).
 * `available` = has local styling signals in this build.
 * `stub` = heuristic / placeholder until a later milestone owns the real metric.
 */
const LAYERS: readonly MapLayerDescriptor[] = [
  {
    id: "architecture",
    label: "Architecture",
    description: "Packages, features, and structural clusters",
    available: true,
    stub: false,
  },
  {
    id: "dependency",
    label: "Dependency",
    description: "Import / re-export edges at the current zoom",
    available: true,
    stub: false,
  },
  {
    id: "activity",
    label: "Activity",
    description: "Edit / touch-surface heat (local stub until M-022)",
    available: true,
    stub: true,
  },
  {
    id: "ownership",
    label: "Ownership",
    description: "Folder / package ownership bands (local stub)",
    available: true,
    stub: true,
  },
  {
    id: "debt",
    label: "Debt",
    description: "Parse diagnostics and failed files",
    available: true,
    stub: false,
  },
  {
    id: "risk",
    label: "Risk",
    description: "Dependency fan-in heat (blast-radius later in M-020)",
    available: true,
    stub: true,
  },
  {
    id: "performance",
    label: "Performance",
    description: "Frontend surface heat (CWV overlays later)",
    available: true,
    stub: true,
  },
  {
    id: "coverage",
    label: "Coverage",
    description: "Coverage gap heat (nearby test presence)",
    available: true,
    stub: true,
  },
];

export function listMapLayerDescriptors(): MapLayerDescriptor[] {
  return LAYERS.map((l) => ({ ...l }));
}

export function defaultActiveLayerIds(): MapLayerId[] {
  return ["architecture", "dependency"];
}

export function resolveActiveLayers(
  requested: readonly string[] | undefined,
): MapLayerId[] {
  if (!requested || requested.length === 0) return defaultActiveLayerIds();
  const allowed = new Set(LAYERS.map((l) => l.id));
  const out: MapLayerId[] = [];
  for (const id of requested) {
    if (allowed.has(id as MapLayerId) && !out.includes(id as MapLayerId)) {
      out.push(id as MapLayerId);
    }
  }
  return out.length > 0 ? out : defaultActiveLayerIds();
}

/** Layers that contribute heat / tint styling (not structure/edges alone). */
export function heatLayerIds(active: readonly MapLayerId[]): MapLayerId[] {
  return active.filter((id) => id !== "architecture" && id !== "dependency");
}
