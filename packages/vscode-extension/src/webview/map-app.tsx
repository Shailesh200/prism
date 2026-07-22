import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { RepositoryMapView } from "@prism/ui";
import type {
  GitRecentFile,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
} from "@prism/shared";
import type { HostToWebview, WebviewToHost } from "../protocol.js";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void;
};

const vscode = acquireVsCodeApi();

function Status({
  message,
  kind,
}: {
  message: string;
  kind: "info" | "error" | "loading";
}): ReactElement {
  return (
    <div className="prism-webview-status" data-kind={kind}>
      {message}
    </div>
  );
}

function App(): ReactElement {
  const [map, setMap] = useState<RepositoryMap | null>(null);
  const [recentChanges, setRecentChanges] = useState<GitRecentFile[]>([]);
  const [branch, setBranch] = useState<string | undefined>();
  const [status, setStatus] = useState<{
    message: string;
    kind: "info" | "error" | "loading";
  }>({ message: "Connecting to Prism…", kind: "loading" });

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || !("type" in msg)) return;
      if (msg.type === "status") {
        setStatus({ message: msg.message, kind: msg.kind });
        if (msg.kind === "error") setMap(null);
        return;
      }
      if (msg.type === "map") {
        setMap(msg.map);
        setRecentChanges(msg.recentChanges);
        setBranch(msg.branch);
        setStatus({ message: "", kind: "info" });
      }
    };
    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const onZoomChange = useCallback((zoom: MapZoomLevel) => {
    vscode.postMessage({ type: "zoom", zoom });
  }, []);

  const onLayersChange = useCallback((layers: readonly MapLayerId[]) => {
    vscode.postMessage({ type: "layers", layers: [...layers] });
  }, []);

  if (!map) {
    return <Status message={status.message} kind={status.kind} />;
  }

  const brand = document.body.getAttribute("data-brand");

  return (
    <RepositoryMapView
      map={map}
      recentChanges={recentChanges}
      {...(branch !== undefined ? { branch } : {})}
      {...(brand ? { brandMarkSrc: brand } : {})}
      showBrand
      onZoomChange={onZoomChange}
      onLayersChange={onLayersChange}
    />
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
