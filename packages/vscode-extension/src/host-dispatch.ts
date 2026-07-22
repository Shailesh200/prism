import type { MapLayerId, MapZoomLevel } from "@prism/shared";
import type { HostRequest, HostResponse } from "./protocol.js";
import type { PrismSession } from "./session.js";

export type HostDispatchState = {
  zoom: MapZoomLevel;
  layers: MapLayerId[];
};

/**
 * Shared Core RPC used by the IDE webview host and the browser bridge.
 */
export async function dispatchHostRequest(
  session: PrismSession,
  req: HostRequest,
  state: HostDispatchState,
): Promise<HostResponse> {
  switch (req.method) {
    case "dashboard": {
      const result = await session.getDashboard(state.zoom);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "dashboard",
        data: result.value,
      };
    }
    case "map": {
      state.zoom = req.zoom;
      if (req.layers) state.layers = req.layers;
      const result = session.getMap(req.zoom, req.layers);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "map", data: result.value };
    }
    case "reindex": {
      const result = await session.reindex();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "reindex", data: null };
    }
    case "overlay": {
      const result = await session.getOverlay(req.kind);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "overlay", data: result.value };
    }
    case "backend": {
      const result = await session.getBackendReport();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "backend", data: result.value };
    }
    case "graph": {
      const result = session.getDependencyGraph();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "graph", data: result.value };
    }
    case "impact": {
      const result = await session.getImpact(req.target);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "impact", data: result.value };
    }
    case "symbols": {
      const result = session.findSymbols(req.query);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "symbols", data: result.value };
    }
    default: {
      return {
        id: (req as HostRequest).id,
        ok: false,
        error: "Unknown method",
      };
    }
  }
}
