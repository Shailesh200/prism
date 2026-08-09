import { Panel, useReactFlow } from "@xyflow/react";
import { Maximize2, Minus, Plus } from "lucide-react";
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
          <Plus size={16} strokeWidth={2} />
        </button>
        <span className="prism-map__nav-sep" aria-hidden />
        <button
          type="button"
          onClick={() => void zoomOut({ duration: 200 })}
          aria-label="Zoom out"
        >
          <Minus size={16} strokeWidth={2} />
        </button>
        <span className="prism-map__nav-sep" aria-hidden />
        <button
          type="button"
          onClick={() => void fitView({ padding: 0.28, duration: 320 })}
          aria-label="Fit view"
        >
          <Maximize2 size={15} strokeWidth={2} />
        </button>
      </div>
    </Panel>
  );
}
