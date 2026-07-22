import type { MapLayerDescriptor, MapLayerId } from "@prism/shared";
import type { ReactElement } from "react";
import { LAYER_TINT, layerLegendItems } from "./map-layers.js";

export type MapLayersPanelProps = {
  readonly layers: readonly MapLayerDescriptor[];
  readonly activeLayerIds: readonly MapLayerId[];
  readonly onChange: (next: readonly MapLayerId[]) => void;
};

export function MapLayersPanel(props: MapLayersPanelProps): ReactElement {
  const legend = layerLegendItems(props.layers, props.activeLayerIds);

  return (
    <div className="prism-layers">
      <p className="prism-layers__kicker">Layers</p>
      <ul className="prism-layers__list">
        {props.layers.map((layer) => {
          const on = props.activeLayerIds.includes(layer.id);
          const tint =
            layer.id === "architecture" || layer.id === "dependency"
              ? null
              : LAYER_TINT[layer.id];
          return (
            <li key={layer.id}>
              <button
                type="button"
                className="prism-layers__toggle"
                data-active={on ? "true" : "false"}
                data-stub={layer.stub ? "true" : "false"}
                data-available={layer.available ? "true" : "false"}
                title={layer.description}
                aria-pressed={on}
                disabled={!layer.available}
                onClick={() => {
                  if (!layer.available) return;
                  const next = on
                    ? props.activeLayerIds.filter((id) => id !== layer.id)
                    : [...props.activeLayerIds, layer.id];
                  props.onChange(
                    next.length > 0 ? next : (["architecture"] as MapLayerId[]),
                  );
                }}
              >
                <span
                  className="prism-layers__swatch"
                  style={
                    tint
                      ? { background: tint.legend }
                      : layer.id === "dependency"
                        ? { background: "var(--prism-brand)" }
                        : { background: "var(--prism-canvas)" }
                  }
                />
                <span className="prism-layers__label">{layer.label}</span>
                {layer.stub ? (
                  <span className="prism-layers__stub">stub</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {legend.length > 0 ? (
        <div className="prism-layers__legend" aria-label="Active layer legend">
          {legend.map((item) => (
            <span key={item.id} className="prism-layers__legend-item">
              <span
                className="prism-layers__legend-dot"
                style={{ background: item.color }}
              />
              {item.label}
              {item.stub ? " · stub" : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
