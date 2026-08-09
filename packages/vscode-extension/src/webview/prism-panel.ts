import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { writePrismConfig } from "@repo-prism/core";
import type * as vscode from "vscode";
import { openPlaygroundInBrowser } from "../open-playground.js";
import { checkHealthRegression } from "../health-alerts.js";
import {
  dispatchHostRequest,
  type HostDispatchState,
} from "../host-dispatch.js";
import type { PrismLogger } from "../logger.js";
import type { PrismSession } from "../session.js";
import type {
  AppView,
  HostAuditEntry,
  HostRequest,
  HostResponse,
  HostToWebview,
  WebviewToHost,
} from "../protocol.js";
import { parseWebviewToHost } from "../protocol-guards.js";
import {
  AUTO_REINDEX_INTERVAL_STATE_KEY,
  AUTO_REINDEX_STATE_KEY,
  getActiveWorkspaceWatch,
  MIN_REINDEX_DEBOUNCE_MS,
  resolveAutoReindexEnabled,
} from "../workspace-watch.js";

/** Deep-link payload forwarded alongside a `navigate` message (M-048 Phase 2/3). */
type NavigateExtras = {
  readonly focusPath?: string;
  readonly focusNodeId?: string;
  readonly targetPath?: string;
  readonly targetPaths?: string[];
  readonly intent?: "edit" | "delete";
};

const LOCAL_ONLY_STATE_KEY = "prism.localOnlyAnalysis";

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
  private readonly dispatchState: HostDispatchState = {
    zoom: "package",
    layers: ["architecture", "dependency"],
  };
  private disposables: vscode.Disposable[] = [];
  private reindexTimer: ReturnType<typeof setTimeout> | undefined;
  /** Queued until the webview posts `ready` (first paint race). */
  private pendingNavigate: ({ view: AppView } & NavigateExtras) | undefined;
  private pendingShowTour = false;
  private webviewReady = false;
  private reindexInFlight = false;
  private reindexDebounceMs = MIN_REINDEX_DEBOUNCE_MS;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly session: PrismSession,
    private readonly log: PrismLogger,
    private readonly vscodeApi: typeof vscode,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.html(this.panel.webview);

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((raw: unknown) => {
        const parsed = parseWebviewToHost(raw);
        if (!parsed.ok) {
          this.log.warn(
            `Discarded malformed webview message: ${parsed.reason}`,
          );
          return;
        }
        void this.onMessage(parsed.value);
      }),
      this.panel.onDidDispose(() => this.dispose()),
    );

    // Activation already owns the FS watch (M-057 P-B1). Sync preference only.
    const stored = this.context.workspaceState.get<boolean>(
      AUTO_REINDEX_STATE_KEY,
    );
    const storedInterval = this.context.workspaceState.get<number>(
      AUTO_REINDEX_INTERVAL_STATE_KEY,
    );
    this.setAutoReindex(resolveAutoReindexEnabled(stored), storedInterval);
  }

  static show(
    vscodeApi: typeof vscode,
    extensionUri: vscode.Uri,
    session: PrismSession,
    log: PrismLogger,
    context: vscode.ExtensionContext,
    initialView: AppView = "overview",
    navigate?: NavigateExtras,
  ): PrismPanel {
    const column = vscodeApi.ViewColumn.Active;
    const extras = navigate ?? {};

    if (PrismPanel.current) {
      PrismPanel.current.panel.reveal(column, false);
      if (initialView !== "overview" || navigate) {
        PrismPanel.current.navigateTo(initialView, extras);
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
      context,
    );
    if (initialView !== "overview" || navigate) {
      // Webview boots async — queue until `ready` so deep links are not lost.
      PrismPanel.current.pendingNavigate = { view: initialView, ...extras };
    }
    return PrismPanel.current;
  }

  /** Ask an already-open panel to jump to a view / deep-link target. */
  navigateTo(view: AppView, navigate?: NavigateExtras): void {
    const payload = { view, ...navigate };
    if (!this.webviewReady) {
      this.pendingNavigate = payload;
      return;
    }
    this.post({ type: "navigate", ...payload });
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    if (msg.type === "ready") {
      this.log.info("Prism webview ready");
      this.webviewReady = true;
      this.postCodeLensEnabled();
      if (this.pendingNavigate) {
        const pending = this.pendingNavigate;
        this.pendingNavigate = undefined;
        this.post({ type: "navigate", ...pending });
      }
      if (this.pendingShowTour) {
        this.pendingShowTour = false;
        this.post({ type: "showTour" });
      }
      return;
    }
    if (msg.type === "zoom") {
      this.dispatchState.zoom = msg.zoom;
      return;
    }
    if (msg.type === "layers") {
      this.dispatchState.layers = msg.layers;
      return;
    }
    if (msg.type === "openFile") {
      await this.openInEditor(msg.path);
      return;
    }
    if (msg.type === "openInBrowser") {
      this.log.info("Webview requested openInBrowser");
      await openPlaygroundInBrowser(this.vscodeApi, {
        session: this.session,
        extensionRoot: this.extensionUri.fsPath,
      });
      return;
    }
    if (msg.type === "runTests") {
      await this.runTestsInTerminal();
      return;
    }
    if (msg.type === "setAutoReindex") {
      this.setAutoReindex(msg.enabled, msg.intervalMs);
      return;
    }
    if (msg.type === "writePrismConfig") {
      const root = this.session.root;
      if (!root) {
        this.log.warn("writePrismConfig: no workspace root");
        return;
      }
      const written = await writePrismConfig(root, {
        excludeGlobs: msg.excludeGlobs,
        maxFileBytes: msg.maxFileBytes,
      });
      if (!written.ok) {
        this.log.warn(`writePrismConfig failed: ${written.error.message}`);
      } else {
        this.log.info("Wrote .prism/config.json from Settings");
      }
      return;
    }
    if (msg.type === "setCodeLens") {
      await this.vscodeApi.workspace
        .getConfiguration("prism")
        .update(
          "codeLens.enabled",
          msg.enabled,
          this.vscodeApi.ConfigurationTarget.Global,
        );
      this.postCodeLensEnabled();
      return;
    }
    if (msg.type === "setLocalOnly") {
      // Persist the flag. Actually halting the file watcher / index loop while
      // local-only is on is a host-enforcement follow-up (see summary).
      void this.context.workspaceState.update(
        LOCAL_ONLY_STATE_KEY,
        msg.enabled,
      );
      if (msg.enabled) this.setAutoReindex(false);
      this.log.info(`Local-only analysis ${msg.enabled ? "on" : "off"}`);
      return;
    }
    if (msg.type === "clearData") {
      await this.clearWorkspaceData();
      return;
    }
    if (msg.type === "request") {
      await this.handleRequest(msg.request);
    }
  }

  /**
   * Clear all locally persisted Prism state for this workspace: on-disk
   * `.prism/cache`, `.prism/remote-ci`, `.prism/tools`, the panel's
   * `workspaceState`, then re-index so the UI reflects a fresh snapshot. The
   * webview clears its own audit log, settings, and integrations before posting
   * `clearData`.
   */
  private async clearWorkspaceData(): Promise<void> {
    this.log.info("Clear Data requested from Settings");
    this.setAutoReindex(false);
    for (const key of this.context.workspaceState.keys()) {
      await this.context.workspaceState.update(key, undefined);
    }
    const root = this.session.root;
    let cacheCleared = false;
    if (root) {
      const prismDirs = ["cache", "remote-ci", "tools"] as const;
      for (const dir of prismDirs) {
        try {
          await rm(join(root, ".prism", dir), {
            recursive: true,
            force: true,
          });
          if (dir === "cache") cacheCleared = true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log.error(`Clear Data: failed to remove .prism/${dir} — ${msg}`);
        }
      }
    }
    this.post({
      type: "status",
      message: "Prism data cleared — re-indexing…",
      kind: "loading",
    });
    const result = await this.session.reindex();
    if (!result.ok) {
      this.log.error(`Clear Data reindex failed: ${result.error.message}`);
      this.post({
        type: "status",
        message: `Clear Data: reindex failed — ${result.error.message}`,
        kind: "error",
      });
      return;
    }
    this.postNavigateRefresh();
    void this.vscodeApi.window.showInformationMessage(
      cacheCleared
        ? "Prism: cleared local cache, remote-ci, tools, audit log, and settings."
        : "Prism: cleared audit log, settings, and workspace state.",
    );
  }

  private setAutoReindex(enabled: boolean, intervalMs?: number): void {
    void this.context.workspaceState.update(AUTO_REINDEX_STATE_KEY, enabled);
    if (typeof intervalMs === "number" && Number.isFinite(intervalMs)) {
      this.reindexDebounceMs = Math.max(MIN_REINDEX_DEBOUNCE_MS, intervalMs);
      void this.context.workspaceState.update(
        AUTO_REINDEX_INTERVAL_STATE_KEY,
        this.reindexDebounceMs,
      );
    }
    if (this.reindexTimer) {
      clearTimeout(this.reindexTimer);
      this.reindexTimer = undefined;
    }
    const watch = getActiveWorkspaceWatch();
    if (watch) {
      watch.setOnChange(() => {
        const freshness = this.session.getIndexFreshness();
        if (freshness.ok && freshness.value.status === "fresh") {
          this.postDataRefresh();
          void checkHealthRegression(
            this.vscodeApi,
            this.session,
            this.context,
          );
        }
      });
      watch.setEnabled(enabled, this.reindexDebounceMs);
      return;
    }
    // Fallback if activation has not wired the controller yet.
    if (!enabled) {
      this.session.stopWatch();
      this.log.info("Auto Re-Index / watch off");
    }
  }

  private async runTestsInTerminal(): Promise<void> {
    const root = this.session.root;
    if (!root) {
      void this.vscodeApi.window.showWarningMessage(
        "Prism: no workspace open to run tests.",
      );
      return;
    }
    const command = detectTestCommand(root);
    const terminal =
      this.vscodeApi.window.terminals.find((t) => t.name === "Prism Tests") ??
      this.vscodeApi.window.createTerminal({
        name: "Prism Tests",
        cwd: root,
      });
    terminal.show(true);
    terminal.sendText(command);
    this.post({
      type: "status",
      message: `Running tests: ${command}`,
      kind: "info",
    });
    this.log.info(`runTests: ${command}`);
  }

  private async handleRequest(req: HostRequest): Promise<void> {
    const started = Date.now();
    try {
      const res = await dispatchHostRequest(
        this.session,
        req,
        this.dispatchState,
        {
          vscodeApi: this.vscodeApi,
          ...(req.method === "lighthouseLab" || req.method === "bundleAnalyze"
            ? {
                onProgress: (event: {
                  message: string;
                  detail?: import("@repo-prism/shared").JsonValue;
                }) => {
                  this.post({
                    type:
                      req.method === "bundleAnalyze"
                        ? "bundleAnalyzeProgress"
                        : "lighthouseLabProgress",
                    id: req.id,
                    message: event.message,
                    ...(event.detail !== undefined
                      ? { detail: event.detail }
                      : {}),
                  });
                },
              }
            : {}),
        },
      );
      this.post(res);
      this.maybePostGitAudit(req, res, Date.now() - started);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error(`request ${req.method}: ${error}`);
      this.post({ id: req.id, ok: false, error });
    }
  }

  /**
   * Git commands run server-side (Core reads local git). Emit a `git`-category
   * audit entry to the webview so git activity / sync / history operations show
   * up in Audit Logs alongside client-side calls.
   */
  private maybePostGitAudit(
    req: HostRequest,
    res: HostResponse,
    durationMs: number,
  ): void {
    if (!res.ok) return;
    let entry: HostAuditEntry | null = null;
    if (req.method === "dashboard" && res.method === "dashboard") {
      const git = res.data.gitActivity;
      const available = git?.available ?? false;
      entry = {
        category: "git",
        operation: "Git activity scan",
        target: res.data.branch ?? res.data.repoLabel ?? "workspace",
        durationMs,
        status: available ? "success" : "warning",
        command: "git log / git status (local)",
        output: available
          ? `branch=${git?.summary?.branch ?? "?"} recentFiles=${
              git?.recentFiles.length ?? 0
            } commits=${git?.recentCommits.length ?? 0}`
          : "No local git history detected for this workspace.",
      };
    } else if (
      req.method === "healthHistoryBackfill" &&
      res.method === "healthHistoryBackfill"
    ) {
      entry = {
        category: "git",
        operation: "Git history backfill",
        target: "workspace",
        durationMs,
        status: "success",
        command: "git log (sampled commits)",
        output: "Started health-history backfill from local git history.",
      };
    } else if (req.method === "regionMovers" && res.method === "regionMovers") {
      entry = {
        category: "git",
        operation: "Git-derived region movers",
        target: "workspace",
        durationMs,
        status: "success",
        command: "history snapshots (git-backed)",
        output: `improving=${res.data.improving.length} regressing=${res.data.regressing.length}`,
      };
    } else if (req.method === "runTests" && res.method === "runTests") {
      const data = res.data;
      const passing =
        data?.results.filter((r) => r.status === "passing").length ?? 0;
      const failing =
        data?.results.filter((r) => r.status === "failing").length ?? 0;
      entry = {
        category: "test",
        operation: req.coverage
          ? "Ran workspace tests with coverage"
          : "Ran workspace tests",
        target: "workspace",
        durationMs,
        status: !data || failing > 0 ? "error" : "success",
        command: req.coverage
          ? "npx vitest/jest --coverage (or package test)"
          : "npx vitest/jest --json (or package test)",
        output: data
          ? `results=${data.results.length} passing=${passing} failing=${failing}`
          : "No test runner available.",
      };
    }
    if (entry) this.post({ type: "audit", entry });
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

  /** Sync current `prism.codeLens.enabled` into the webview Settings toggle. */
  postCodeLensEnabled(): void {
    const enabled = this.vscodeApi.workspace
      .getConfiguration("prism")
      .get<boolean>("codeLens.enabled", false);
    this.post({ type: "codeLensEnabled", enabled });
  }

  /** Ask the webview to reload dashboard data after reindex — keep current view. */
  postNavigateRefresh(): void {
    this.postDataRefresh();
  }

  /** Soft data refresh (watch / reindex / clear) without changing the active screen. */
  postDataRefresh(): void {
    this.post({ type: "dataRefresh" });
  }

  /** Ask the webview to show the in-app product tour (Settings / command). */
  postShowTour(): void {
    if (!this.webviewReady) {
      this.pendingShowTour = true;
      return;
    }
    this.post({ type: "showTour" });
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
      // Narrowed to the hosts the webview can actually reach (M-036 Phase
      // 2.5). `https:` here previously allowed an image or font request to
      // anywhere, which is exactly the shape of the Gravatar leak this
      // milestone closed. Fonts and styles ship with the extension.
      `img-src ${webview.cspSource} data: https://www.gravatar.com`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${n}'`,
      `font-src ${webview.cspSource} data:`,
      // Opt-in network integrations (GitHub Actions, PageSpeed) from the
      // webview. A host listed here is reachable, not permitted: consent is
      // enforced in Core, and the CSP only bounds the blast radius of a bug.
      `connect-src ${webview.cspSource} https://api.github.com https://www.googleapis.com`,
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
    // Activation owns the FS watch — closing the panel must not stop it (P-B1).
    if (this.reindexTimer) {
      clearTimeout(this.reindexTimer);
      this.reindexTimer = undefined;
    }
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

function detectTestCommand(root: string): string {
  if (
    existsSync(join(root, "bun.lock")) ||
    existsSync(join(root, "bun.lockb"))
  ) {
    return "bun test";
  }
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    if (pkg.scripts?.test) {
      if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm test";
      if (existsSync(join(root, "yarn.lock"))) return "yarn test";
      return "npm test";
    }
  } catch {
    /* fall through */
  }
  if (
    existsSync(join(root, "pytest.ini")) ||
    existsSync(join(root, "pyproject.toml"))
  ) {
    return "pytest";
  }
  return "bun test";
}

/** @deprecated alias — Map panel is now the full Prism app */
export const MapPanel = PrismPanel;
