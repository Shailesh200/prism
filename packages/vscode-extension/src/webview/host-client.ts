import type {
  BackendReport,
  GraphSnapshotDto,
  MapLayerId,
  MapZoomLevel,
  UtilityOverlayReport,
} from "@prism/shared";
import type {
  DashboardPayload,
  HostRequest,
  HostResponse,
  HostToWebview,
  ImpactBundle,
  ImpactTarget,
  MapPayload,
  SymbolSearchHit,
  WebviewToHost,
} from "../protocol.js";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void;
};

type VsCodeApi = { postMessage(message: WebviewToHost): void };

const isBrowser =
  typeof document !== "undefined" &&
  document.body?.getAttribute("data-prism-mode") === "browser";

let vscodeApi: VsCodeApi | null = null;
if (!isBrowser) {
  try {
    vscodeApi = acquireVsCodeApi();
  } catch {
    vscodeApi = null;
  }
}

type Pending = {
  resolve: (value: HostResponse) => void;
  reject: (err: Error) => void;
};

const pending = new Map<string, Pending>();
let seq = 0;

function nextId(): string {
  seq += 1;
  return `req-${seq}`;
}

function request(
  body: Omit<HostRequest, "id"> & { method: string },
): Promise<HostResponse> {
  const id = nextId();
  const full = { ...body, id } as HostRequest;

  if (isBrowser || !vscodeApi) {
    return fetch("/api/host", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(full),
    }).then(async (res) => {
      const json = (await res.json()) as HostResponse;
      return json;
    });
  }

  return new Promise<HostResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    vscodeApi!.postMessage({ type: "request", request: full });
  });
}

export function handleHostMessage(msg: HostToWebview): void {
  if (!msg || typeof msg !== "object") return;
  if (!("id" in msg) || typeof (msg as HostResponse).id !== "string") return;
  const res = msg as HostResponse;
  const wait = pending.get(res.id);
  if (!wait) return;
  pending.delete(res.id);
  wait.resolve(res);
}

export async function fetchDashboard(): Promise<DashboardPayload> {
  const res = await request({ method: "dashboard" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "dashboard") throw new Error("Unexpected response");
  return res.data;
}

export async function fetchRepositoryMap(
  zoom: MapZoomLevel,
  layers?: readonly MapLayerId[] | null,
): Promise<MapPayload> {
  const res = await request({
    method: "map",
    zoom,
    ...(layers && layers.length > 0 ? { layers: [...layers] } : {}),
  } as Omit<HostRequest, "id">);
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "map") throw new Error("Unexpected response");
  return res.data;
}

export async function fetchReindex(): Promise<void> {
  const res = await request({ method: "reindex" });
  if (!res.ok) throw new Error(res.error);
}

export async function fetchOverlay(
  kind: string,
): Promise<UtilityOverlayReport | null> {
  const res = await request({ method: "overlay", kind } as Omit<
    HostRequest,
    "id"
  >);
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "overlay") throw new Error("Unexpected response");
  return res.data;
}

export async function fetchBackendReport(): Promise<BackendReport | null> {
  const res = await request({ method: "backend" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "backend") throw new Error("Unexpected response");
  return res.data;
}

export async function fetchDependencyGraph(
  _root?: string | null,
): Promise<GraphSnapshotDto | null> {
  const res = await request({ method: "graph" });
  if (!res.ok) throw new Error(res.error);
  if (res.method !== "graph") throw new Error("Unexpected response");
  return res.data;
}

export async function fetchImpactBundle(
  target: ImpactTarget,
  _root?: string | null,
): Promise<{ ok: true; value: ImpactBundle } | { ok: false; error: string }> {
  const res = await request({ method: "impact", target } as Omit<
    HostRequest,
    "id"
  >);
  if (!res.ok) return { ok: false, error: res.error };
  if (res.method !== "impact")
    return { ok: false, error: "Unexpected response" };
  return res.data;
}

export async function fetchSymbolHits(
  query: string,
  _root?: string | null,
): Promise<SymbolSearchHit[]> {
  const res = await request({ method: "symbols", query } as Omit<
    HostRequest,
    "id"
  >);
  if (!res.ok) return [];
  if (res.method !== "symbols") return [];
  return res.data;
}

export type {
  ImpactBundle,
  ImpactTarget,
  SymbolSearchHit,
  DashboardPayload,
  MapPayload,
};

export function openFile(path: string): void {
  if (isBrowser || !vscodeApi) {
    // Browser has no editor — path stays visible in the UI.
    console.info("[prism] openFile (browser):", path);
    return;
  }
  vscodeApi.postMessage({ type: "openFile", path });
}

export function postToHost(message: WebviewToHost): void {
  if (isBrowser || !vscodeApi) {
    if (message.type === "openInBrowser") return;
    return;
  }
  vscodeApi.postMessage(message);
}

export { vscodeApi as vsCodeApi, isBrowser };
