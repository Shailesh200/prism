import type { MapLayerId, MapZoomLevel } from "@prism/shared";
import type * as vscode from "vscode";
import type { PrismLogger } from "../logger.js";
import type { PrismSession } from "../session.js";
import type { HostToWebview, WebviewToHost } from "../protocol.js";

function nonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export class MapPanel {
  public static current: MapPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private zoom: MapZoomLevel = "package";
  private layers: MapLayerId[] = ["architecture", "dependency"];
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly session: PrismSession,
    private readonly log: PrismLogger,
    private readonly vscodeApi: typeof vscode,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.html(this.panel.webview);

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((raw: unknown) => {
        void this.onMessage(raw as WebviewToHost);
      }),
      this.panel.onDidDispose(() => this.dispose()),
    );
  }

  static show(
    vscodeApi: typeof vscode,
    extensionUri: vscode.Uri,
    session: PrismSession,
    log: PrismLogger,
  ): MapPanel {
    // Always a full editor tab (not Beside) — Beside splits and shrinks the map.
    const column = vscodeApi.ViewColumn.Active;

    if (MapPanel.current) {
      MapPanel.current.panel.reveal(column, false);
      void MapPanel.current.pushMap();
      return MapPanel.current;
    }

    const panel = vscodeApi.window.createWebviewPanel(
      "prismRepositoryMap",
      "Prism Map",
      { viewColumn: column, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscodeApi.Uri.joinPath(extensionUri, "dist"),
          vscodeApi.Uri.joinPath(extensionUri, "media"),
        ],
      },
    );

    MapPanel.current = new MapPanel(
      panel,
      extensionUri,
      session,
      log,
      vscodeApi,
    );
    return MapPanel.current;
  }

  async pushMap(): Promise<void> {
    this.post({ type: "status", message: "Loading map…", kind: "loading" });
    const result = this.session.getMap(this.zoom, this.layers);
    if (!result.ok) {
      const msg = result.error.message;
      this.log.error(`Map: ${msg}`);
      this.post({ type: "status", message: msg, kind: "error" });
      return;
    }
    this.post({
      type: "map",
      map: result.value.map,
      recentChanges: result.value.recentChanges,
      ...(result.value.branch !== undefined
        ? { branch: result.value.branch }
        : {}),
    });
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    if (msg.type === "ready") {
      await this.pushMap();
      return;
    }
    if (msg.type === "zoom") {
      this.zoom = msg.zoom;
      await this.pushMap();
      return;
    }
    if (msg.type === "layers") {
      this.layers = msg.layers;
      await this.pushMap();
    }
  }

  private post(message: HostToWebview): void {
    void this.panel.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      this.vscodeApi.Uri.joinPath(
        this.extensionUri,
        "dist",
        "webview",
        "map-app.js",
      ),
    );
    const tokensUri = webview.asWebviewUri(
      this.vscodeApi.Uri.joinPath(this.extensionUri, "dist", "tokens.css"),
    );
    const mapUri = webview.asWebviewUri(
      this.vscodeApi.Uri.joinPath(this.extensionUri, "dist", "map.css"),
    );
    const cssUri = webview.asWebviewUri(
      this.vscodeApi.Uri.joinPath(this.extensionUri, "dist", "webview.css"),
    );
    const markUri = webview.asWebviewUri(
      this.vscodeApi.Uri.joinPath(this.extensionUri, "media", "prism-mark.png"),
    );
    // Bundled @xyflow CSS (emitted next to map-app.js when present).
    const flowCssPath = this.vscodeApi.Uri.joinPath(
      this.extensionUri,
      "dist",
      "webview",
      "map-app.css",
    );
    const flowCssUri = webview.asWebviewUri(flowCssPath);
    const n = nonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${n}'`,
      `font-src ${webview.cspSource} data:`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${tokensUri}" />
  <link rel="stylesheet" href="${mapUri}" />
  <link rel="stylesheet" href="${flowCssUri}" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>Prism Map</title>
</head>
<body data-brand="${markUri}">
  <div id="root"></div>
  <script type="module" nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    MapPanel.current = undefined;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
