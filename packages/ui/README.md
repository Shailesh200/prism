# @prism/ui

Shared React UI for the Repository Map (playground + future IDE webviews).

**Implemented:** M-018  
**Stack:** React 19 + React Flow (`@xyflow/react`) per ADR-0003  
**Theme:** Signal Chart tokens (`tokens.css` ← `plans/mockups/DESIGN.md`)

## Usage

```tsx
import { RepositoryMapView } from "@prism/ui";
import "@prism/ui/map.css";

<RepositoryMapView
  map={repositoryMap}
  brandMarkSrc="/brand/prism-mark.png"
  onZoomChange={setZoom}
/>
```

Load **Satoshi** (Fontshare) + **IBM Plex Mono** in the host document. Surfaces load map data from `@prism/core` only.
