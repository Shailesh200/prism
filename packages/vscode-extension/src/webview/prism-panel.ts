import type { MapLayerId, MapZoomLevel } from "@prism/shared";
import type * as vscode from "vscode";
import type { PrismLogger } from "../logger.js";
import type { PrismSession } from "../session.js";
import type {
  AppView,
  HostRequest,
  HostResponse,
  HostToWebview,
  WebviewToHost,
} from "../protocol.js";

function nonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export class PrismPanel {
  public static current: PrismPanel | undefined;

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
    initialView: AppView = "overview",
  ): PrismPanel {
    const column = vscodeApi.ViewColumn.Active;

    if (PrismPanel.current) {
      PrismPanel.current.panel.reveal(column, false);
      if (initialView !== "overview") {
        PrismPanel.current.post({ type: "navigate", view: initialView });
      }
      return PrismPanel.current;
    }

    const panel = vscodeApi.window.createWebviewPanel(
      "prismApp",
      "Prism",
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

    PrismPanel.current = new PrismPanel(
      panel,
      extensionUri,
      session,
      log,
      vscodeApi,
    );
    if (initialView !== "overview") {
      // Webview loads async; navigate after ready also handles default.
      queueMicrotask(() => {
        PrismPanel.current?.post({ type: "navigate", view: initialView });
      });
    }
    return PrismPanel.current;
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    if (msg.type === "ready") {
      this.log.info("Prism webview ready");
      return;
    }
    if (msg.type === "zoom") {
      this.zoom = msg.zoom;
      return;
    }
    if (msg.type === "layers") {
      this.layers = msg.layers;
      return;
    }
    if (msg.type === "openFile") {
      await this.openInEditor(msg.path);
      return;
    }
    if (msg.type === "request") {
      await this.handleRequest(msg.request);
    }
  }

  private async handleRequest(req: HostRequest): Promise<void> {
    try {
      const res = await this.dispatch(req);
      this.post(res);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error(`request ${req.method}: ${error}`);
      this.post({ id: req.id, ok: false, error });
    }
  }

  private async dispatch(req: HostRequest): Promise<HostResponse> {
    switch (req.method) {
      case "dashboard": {
        const result = await this.session.getDashboard(this.zoom);
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
        this.zoom = req.zoom;
        if (req.layers) this.layers = req.layers;
        const result = this.session.getMap(req.zoom, req.layers);
        if (!result.ok)
          return { id: req.id, ok: false, error: result.error.message };
        return { id: req.id, ok: true, method: "map", data: result.value };
      }
      case "reindex": {
        const result = await this.session.reindex();
        if (!result.ok)
          return { id: req.id, ok: false, error: result.error.message };
        return { id: req.id, ok: true, method: "reindex", data: null };
      }
      case "overlay": {
        const result = await this.session.getOverlay(req.kind);
        if (!result.ok)
          return { id: req.id, ok: false, error: result.error.message };
        return { id: req.id, ok: true, method: "overlay", data: result.value };
      }
      case "backend": {
        const result = await this.session.getBackendReport();
        if (!result.ok)
          return { id: req.id, ok: false, error: result.error.message };
        return { id: req.id, ok: true, method: "backend", data: result.value };
      }
      case "graph": {
        const result = this.session.getDependencyGraph();
        if (!result.ok)
          return { id: req.id, ok: false, error: result.error.message };
        return { id: req.id, ok: true, method: "graph", data: result.value };
      }
      case "impact": {
        const result = await this.session.getImpact(req.target);
        if (!result.ok)
          return { id: req.id, ok: false, error: result.error.message };
        return { id: req.id, ok: true, method: "impact", data: result.value };
      }
      case "symbols": {
        const result = this.session.findSymbols(req.query);
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

  private async openInEditor(repoRelativePath: string): Promise<void> {
    const root = this.session.root;
    if (!root) {
      void this.vscodeApi.window.showWarningMessage(
        "Prism: no workspace open to resolve file path.",
      );
      return;
    }
    const abs = this.vscodeApi.Uri.file(
      `${root.replace(/\/$/, "")}/${repoRelativePath.replace(/^\//, "")}`,
    );
    try {
      const doc = await this.vscodeApi.workspace.openTextDocument(abs);
      await this.vscodeApi.window.showTextDocument(doc, {
        preview: true,
        viewColumn: this.vscodeApi.ViewColumn.Beside,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`openFile ${repoRelativePath}: ${msg}`);
      void this.vscodeApi.window.showErrorMessage(
        `Prism: could not open ${repoRelativePath}`,
      );
    }
  }

  private post(message: HostToWebview): void {
    void this.panel.webview.postMessage(message);
  }

  /** Ask the webview to reload dashboard data after reindex. */
  postNavigateRefresh(): void {
    this.post({ type: "navigate", view: "overview" });
    this.post({
      type: "status",
      message: "Reindexed — refresh the view if needed",
      kind: "info",
    });
  }

  private html(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      this.vscodeApi.Uri.joinPath(
        this.extensionUri,
        "dist",
        "webview",
        "app.js",
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
    const flowCssUri = webview.asWebviewUri(
      this.vscodeApi.Uri.joinPath(
        this.extensionUri,
        "dist",
        "webview",
        "app.css",
      ),
    );
    const n = nonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${n}'`,
      `font-src ${webview.cspSource} data: https:`,
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
  <title>Prism</title>
</head>
<body class="prism-theme" data-brand="${markUri}">
  <div id="root"></div>
  <script type="module" nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    PrismPanel.current = undefined;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

/** @deprecated alias — Map panel is now the full Prism app */
export const MapPanel = PrismPanel;
