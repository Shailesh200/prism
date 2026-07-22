import { Background, BackgroundVariant } from "@xyflow/react";
import type { ReactElement } from "react";

/**
 * Layered "Signal Chart" basemap that pans with the canvas:
 * a coarse graticule + a fine grid, plus SVG defs (gradient, glow)
 * referenced by dependency edges. Rendered inside <ReactFlow>.
 */
export function MapAtmosphere(): ReactElement {
  return (
    <>
      <Background
        id="prism-graticule"
        variant={BackgroundVariant.Lines}
        gap={132}
        lineWidth={1}
        color="var(--prism-grid-line)"
      />
      <Background
        id="prism-grid-fine"
        variant={BackgroundVariant.Lines}
        gap={33}
        lineWidth={1}
        color="var(--prism-grid-fine)"
      />
      <svg className="prism-map__defs" aria-hidden width={0} height={0}>
        <defs>
          <linearGradient
            id="prism-edge-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor="var(--prism-brand)"
              stopOpacity="0.9"
            />
            <stop
              offset="100%"
              stopColor="var(--prism-brand-strong)"
              stopOpacity="0.35"
            />
          </linearGradient>
        </defs>
      </svg>
    </>
  );
}
