import type { MapLayerDescriptor, MapLayerId } from "@prism/shared";

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
    description: "Git churn / edit heat (stub until M-022)",
    available: false,
    stub: true,
  },
  {
    id: "ownership",
    label: "Ownership",
    description: "CODEOWNERS / team regions (stub)",
    available: false,
    stub: true,
  },
  {
    id: "debt",
    label: "Debt",
    description: "Diagnostics and debt hotspots (stub)",
    available: false,
    stub: true,
  },
  {
    id: "risk",
    label: "Risk",
    description: "Blast-radius / risk heat (stub until M-020)",
    available: false,
    stub: true,
  },
  {
    id: "performance",
    label: "Performance",
    description: "CWV / utility overlays (stub wiring to M-041)",
    available: false,
    stub: true,
  },
  {
    id: "coverage",
    label: "Coverage",
    description: "Test coverage overlays (stub)",
    available: false,
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
