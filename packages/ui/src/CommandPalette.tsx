import type {
  MapLayerDescriptor,
  MapLayerId,
  MapSearchHit,
  MapZoomLevel,
} from "@repo-prism/shared";
import { Command } from "cmdk";
import {
  Boxes,
  Braces,
  File as FileIcon,
  Hexagon,
  Layers,
  Package,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { filterSearchHits } from "./map-model.js";

const ZOOM_LABEL: Record<MapZoomLevel, string> = {
  repo: "Repo",
  package: "Package",
  feature: "Feature",
  file: "File",
  symbol: "Symbol",
};

const ZOOM_ICON: Record<MapZoomLevel, typeof Hexagon> = {
  repo: Boxes,
  package: Package,
  feature: Hexagon,
  file: FileIcon,
  symbol: Braces,
};

export type CommandPaletteProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly searchIndex: readonly MapSearchHit[];
  readonly levels: readonly MapZoomLevel[];
  readonly activeZoom: MapZoomLevel;
  readonly onZoom: (zoom: MapZoomLevel) => void;
  readonly layers: readonly MapLayerDescriptor[];
  readonly activeLayerIds: readonly MapLayerId[];
  readonly onLayersChange: (layers: readonly MapLayerId[]) => void;
  readonly onSelectNode: (nodeId: string) => void;
};

export function CommandPalette(props: CommandPaletteProps): ReactElement {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!props.open) setQuery("");
  }, [props.open]);

  const hits = useMemo(
    () => filterSearchHits(props.searchIndex, query).slice(0, 40),
    [props.searchIndex, query],
  );

  const q = query.trim().toLowerCase();
  const match = (label: string) => q === "" || label.toLowerCase().includes(q);

  const toggleLayer = (id: MapLayerId) => {
    const on = props.activeLayerIds.includes(id);
    const next = on
      ? props.activeLayerIds.filter((l) => l !== id)
      : [...props.activeLayerIds, id];
    props.onLayersChange(
      next.length > 0 ? next : (["architecture"] as MapLayerId[]),
    );
    props.onOpenChange(false);
  };

  return (
    <Command.Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      label="Prism command menu"
      shouldFilter={false}
      className="prism-cmd"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search features, files, symbols… or jump to an altitude"
      />
      <Command.List>
        <Command.Empty>No matches</Command.Empty>

        {hits.length > 0 ? (
          <Command.Group heading="Jump to">
            {hits.map((hit) => (
              <Command.Item
                key={hit.id}
                value={`hit:${hit.id}`}
                onSelect={() => {
                  if (hit.kind === "node") {
                    props.onSelectNode(hit.id.replace(/^search:node:/, ""));
                  }
                  props.onOpenChange(false);
                }}
              >
                <span className="prism-cmd__label">{hit.label}</span>
                <span className="prism-cmd__kind">{hit.kind}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        <Command.Group heading="Altitude">
          {props.levels
            .filter((level) => match(ZOOM_LABEL[level]))
            .map((level) => {
              const Icon = ZOOM_ICON[level];
              return (
                <Command.Item
                  key={level}
                  value={`zoom:${level}`}
                  onSelect={() => {
                    props.onZoom(level);
                    props.onOpenChange(false);
                  }}
                >
                  <Icon className="prism-cmd__icon" size={15} strokeWidth={2} />
                  <span className="prism-cmd__label">
                    Go to {ZOOM_LABEL[level]}
                  </span>
                  {level === props.activeZoom ? (
                    <span className="prism-cmd__kind">current</span>
                  ) : null}
                </Command.Item>
              );
            })}
        </Command.Group>

        <Command.Group heading="Layers">
          {props.layers
            .filter((layer) => match(layer.label))
            .map((layer) => {
              const on = props.activeLayerIds.includes(layer.id);
              return (
                <Command.Item
                  key={layer.id}
                  value={`layer:${layer.id}`}
                  disabled={!layer.available}
                  onSelect={() => toggleLayer(layer.id)}
                >
                  <Layers
                    className="prism-cmd__icon"
                    size={15}
                    strokeWidth={2}
                  />
                  <span className="prism-cmd__label">
                    {on ? "Hide" : "Show"} {layer.label}
                  </span>
                  {on ? <span className="prism-cmd__kind">on</span> : null}
                </Command.Item>
              );
            })}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
