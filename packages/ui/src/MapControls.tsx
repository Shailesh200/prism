import { Panel, useReactFlow } from "@xyflow/react";
import type { ReactElement } from "react";

export function MapControls(): ReactElement {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <Panel position="bottom-right" className="prism-map__nav-panel">
      <div className="prism-map__nav" aria-label="Map navigation">
        <button
          type="button"
          onClick={() => void zoomIn({ duration: 200 })}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => void zoomOut({ duration: 200 })}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => void fitView({ padding: 0.22, duration: 320 })}
          aria-label="Fit view"
        >
          ⤢
        </button>
      </div>
    </Panel>
  );
}
