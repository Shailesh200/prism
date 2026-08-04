import type { MapLayerDescriptor, MapLayerId } from "@prism/shared";
import type { ReactElement } from "react";
import { LAYER_TINT, NO_DATA_LEGEND, layerLegendItems } from "./map-layers.js";

export type MapLayersPanelProps = {
  readonly layers: readonly MapLayerDescriptor[];
  readonly activeLayerIds: readonly MapLayerId[];
  readonly onChange: (next: readonly MapLayerId[]) => void;
  /**
   * Layers no node in this repository has data for (ADR-0029). Toggling one on
   * would paint nothing, so it is disabled with a reason rather than offered
   * and silently flat.
   */
  readonly noDataLayerIds?: readonly MapLayerId[];
};

const NO_DATA_REASON =
  "No data in this repository — Prism has nothing to show for this layer.";

export function MapLayersPanel(props: MapLayersPanelProps): ReactElement {
  const noData = new Set(props.noDataLayerIds ?? []);
  const legend = layerLegendItems(props.layers, props.activeLayerIds);
  const activeWithoutData = legend.filter((item) => noData.has(item.id));

  return (
    <div className="prism-layers">
      <p className="prism-layers__kicker">Layers</p>
      <ul className="prism-layers__list">
        {props.layers.map((layer) => {
          const on = props.activeLayerIds.includes(layer.id);
          const empty = noData.has(layer.id);
          const disabled = !layer.available || empty;
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
                data-no-data={empty ? "true" : "false"}
                title={empty ? NO_DATA_REASON : layer.description}
                aria-pressed={on}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
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
                {empty ? (
                  <span className="prism-layers__nodata">no data</span>
                ) : layer.stub ? (
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
            <span
              key={item.id}
              className="prism-layers__legend-item"
              data-no-data={noData.has(item.id) ? "true" : "false"}
            >
              <span
                className="prism-layers__legend-dot"
                style={{
                  background: noData.has(item.id) ? NO_DATA_LEGEND : item.color,
                }}
              />
              {item.label}
              {noData.has(item.id) ? " · no data" : item.stub ? " · stub" : ""}
            </span>
          ))}
        </div>
      ) : null}
      {activeWithoutData.length > 0 ? (
        <p className="prism-layers__note">
          {activeWithoutData.length === 1
            ? `${activeWithoutData[0]!.label} has no data in this repository.`
            : `${activeWithoutData.length} active layers have no data in this repository.`}
        </p>
      ) : null}
    </div>
  );
}
