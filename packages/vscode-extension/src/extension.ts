import * as vscode from "vscode";
import { dirname } from "node:path";
import { BrowserBridge } from "./browser-bridge.js";
import { PrismCodeLensProvider } from "./codelens-provider.js";
import { checkHealthRegression } from "./health-alerts.js";
import { createLogger } from "./logger.js";
import { openPlaygroundInBrowser } from "./open-playground.js";
import type { AppView } from "./protocol.js";
import { PrismSession } from "./session.js";
import { PrismPanel } from "./webview/prism-panel.js";

export const PACKAGE_NAME = "@prism/vscode-extension" as const;

const AUTO_OPEN_STATE_KEY = "prism.autoOpenFolderAttempts";

let session: PrismSession | undefined;
let logger: ReturnType<typeof createLogger> | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let extensionUri: vscode.Uri | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
/** Serializes index work so overlapping folder opens don't race. */
let bootChain: Promise<void> = Promise.resolve();
let lastBootedRoot: string | null = null;
/** True while ensureSession/reindex own the status bar text (transient states). */
let statusBarBusy = false;
let statusBarTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Render Ready/Stale/Indexing from `session.getIndexFreshness()` (M-048
 * Phase 3). No-ops while a foreground operation (open/reindex) owns the
 * status bar text via `statusBarBusy`.
 */
function updateStatusBar(): void {
  if (!statusBar || statusBarBusy) return;
  if (!session?.isOpen) {
    statusBar.text = "$(folder) Prism: open a folder";
    statusBar.tooltip = "Prism — open a folder in this window to index";
    return;
  }
  const freshness = session.getIndexFreshness();
  if (!freshness.ok) {
    statusBar.text = "$(symbol-namespace) Prism";
    statusBar.tooltip = "Prism — click for options";
    return;
  }
  const f = freshness.value;
  const lastIndexed = f.lastIndexedAt
    ? new Date(f.lastIndexedAt).toLocaleString()
    : "never";
  if (f.status === "indexing") {
    statusBar.text = "$(sync~spin) Prism: indexing…";
  } else if (f.status === "stale") {
    statusBar.text = `$(warning) Prism: stale (${f.pendingDirtyCount})`;
  } else {
    statusBar.text = "$(check) Prism: ready";
  }
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(
    `**Prism** — ${f.status}\n\nLast indexed: ${lastIndexed}\n\nPending changes: ${f.pendingDirtyCount}\n\nClick for options…`,
  );
  statusBar.tooltip = tooltip;
}

async function showStatusBarMenu(): Promise<void> {
  const picks: Array<vscode.QuickPickItem & { action: string }> = [
    { label: "$(book) Open Prism", action: "open" },
    { label: "$(sync) Reindex", action: "reindex" },
    { label: "$(location) Reveal on Map", action: "map" },
  ];
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length > 1) {
    picks.push({
      label: "$(root-folder) Switch workspace folder…",
      action: "switchFolder",
    });
  }
  const pick = await vscode.window.showQuickPick(picks, {
    placeHolder: "Prism",
  });
  if (!pick) return;
  if (pick.action === "open") {
    await vscode.commands.executeCommand("prism.open");
  } else if (pick.action === "reindex") {
    await vscode.commands.executeCommand("prism.reindex");
  } else if (pick.action === "map") {
    await vscode.commands.executeCommand("prism.openRepositoryMap");
  } else if (pick.action === "switchFolder") {
    await vscode.commands.executeCommand("prism.switchWorkspaceFolder");
  }
}

function folderPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Repo-relative, forward-slashed path for a URI (undefined if not resolvable). */
function relPathFromUri(uri: vscode.Uri | undefined): string | undefined {
  if (!uri) return undefined;
  const rel = vscode.workspace.asRelativePath(uri, false);
  if (!rel || rel === uri.fsPath) return undefined;
  return rel.replace(/\\/g, "/");
}

/**
 * Resolve a single target path for editor/context and explorer/context
 * commands (M-048 Phase 2): prefer the URI VS Code passes as the first
 * command argument (explorer click), else fall back to the active editor.
 */
function resolveCommandTargetPath(arg: unknown): string | undefined {
  if (arg instanceof vscode.Uri) {
    const rel = relPathFromUri(arg);
    if (rel) return rel;
  }
  return relPathFromUri(vscode.window.activeTextEditor?.document.uri);
}

/**
 * Resolve one or more target paths for `scm/resourceState/context` (M-048
 * Phase 4): VS Code passes the clicked resource state first, then — for a
 * multi-select — an array of all selected resource states as the 2nd arg.
 */
function resolveScmTargetPaths(arg: unknown, selected: unknown): string[] {
  const states: unknown[] = Array.isArray(selected)
    ? selected
    : arg !== undefined
      ? [arg]
      : [];
  const paths: string[] = [];
  for (const state of states) {
    const uri = (state as { resourceUri?: vscode.Uri } | undefined)
      ?.resourceUri;
    const rel = relPathFromUri(uri);
    if (rel && !paths.includes(rel)) paths.push(rel);
  }
  return paths;
}

/** Monorepo root when developing from packages/vscode-extension (…/Prism). */
function inferredDevRepoRoot(extUri: vscode.Uri): string {
  // …/packages/vscode-extension → …/packages → …/Prism
  return dirname(dirname(extUri.fsPath));
}

async function ensureSession(): Promise<PrismSession | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window
      .showWarningMessage(
        "Prism: open a folder in this Extension Development Host window.",
        "Open Folder…",
      )
      .then((pick) => {
        if (pick === "Open Folder…") {
          void vscode.commands.executeCommand(
            "workbench.action.files.openFolder",
          );
        }
      });
    return undefined;
  }
  if (!session) session = new PrismSession();
  if (session.root === folder.uri.fsPath && session.isOpen) return session;

  statusBarBusy = true;
  statusBar!.text = "$(sync~spin) Prism: indexing…";
  logger!.info(`Opening workspace ${folder.uri.fsPath}`);
  try {
    const opened = await session.open(folder.uri.fsPath);
    if (!opened.ok) {
      statusBar!.text = "$(error) Prism";
      logger!.error(opened.error.message);
      logger!.show();
      void vscode.window.showErrorMessage(
        `Prism: failed to index — ${opened.error.message}`,
      );
      return undefined;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    statusBar!.text = "$(error) Prism";
    logger!.error(msg);
    logger!.show();
    void vscode.window.showErrorMessage(`Prism: failed to index — ${msg}`);
    return undefined;
  } finally {
    statusBarBusy = false;
  }
  lastBootedRoot = folder.uri.fsPath;
  logger!.info("Index ready");
  updateStatusBar();
  void checkHealthRegression(vscode, session, extensionContext);
  return session;
}

async function bootWorkspace(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    statusBar!.text = "$(folder) Prism: open a folder";
    statusBar!.tooltip = "Prism — open a folder in this window to index";
    logger!.info("No workspace folder yet — waiting…");
    return;
  }

  if (lastBootedRoot === folder.uri.fsPath && session?.isOpen) {
    logger!.info(`Already indexed ${folder.uri.fsPath}`);
    return;
  }

  const s = await ensureSession();
  if (!s) return;

  updateStatusBar();
  // Index quietly in the background. Do not auto-open the Prism panel or
  // toast — the user opens Prism explicitly (status bar / command / CodeLens).
  logger!.info(`Indexed ${folder.name} (panel stays closed until opened)`);
}

function queueBoot(): void {
  bootChain = bootChain
    .then(() => bootWorkspace())
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger?.error(`Boot failed: ${msg}`);
      logger?.show();
      statusBar!.text = "$(error) Prism";
      void vscode.window.showErrorMessage(`Prism: ${msg}`);
    });
}

async function tryAttachDevRepo(
  context: vscode.ExtensionContext,
): Promise<boolean> {
  if (!extensionUri) return false;
  const attempts = context.globalState.get<number>(AUTO_OPEN_STATE_KEY) ?? 0;
  if (attempts >= 1) {
    logger!.warn(
      "Cursor did not attach a folder after auto-open. Use File → Open Folder in this window (CardWise, Prism, etc).",
    );
    return false;
  }

  const root = inferredDevRepoRoot(extensionUri);
  logger!.info(`No folder attached — opening ${root} in this window…`);
  await context.globalState.update(AUTO_OPEN_STATE_KEY, attempts + 1);
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(root),
    { forceReuseWindow: true },
  );
  return true;
}

/**
 * Cursor/VS Code may finish activating before the folder URI from launch
 * args is attached. Poll briefly + react to folder changes.
 */
function watchForFolder(context: vscode.ExtensionContext): void {
  const tryBoot = (reason: string) => {
    const root = folderPath();
    if (!root) return;
    void context.globalState.update(AUTO_OPEN_STATE_KEY, 0);
    if (root === lastBootedRoot && session?.isOpen) return;
    logger!.info(`Workspace available (${reason}): ${root}`);
    queueBoot();
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      logger!.info(`Folders changed +${e.added.length}/-${e.removed.length}`);
      if (e.removed.length > 0) {
        session?.close();
        session = new PrismSession();
        lastBootedRoot = null;
      }
      if (folderPath()) {
        statusBar!.text = "$(sync~spin) Prism: indexing…";
        tryBoot("onDidChangeWorkspaceFolders");
      } else {
        statusBar!.text = "$(folder) Prism: open a folder";
      }
    }),
  );

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (folderPath()) {
      clearInterval(timer);
      tryBoot("poll");
      return;
    }
    // ~1.5s: Cursor often never applies launch folder args — open Prism here.
    if (attempts === 6) {
      void tryAttachDevRepo(context).then((opened) => {
        if (opened) clearInterval(timer);
      });
      return;
    }
    if (attempts >= 40) {
      clearInterval(timer);
      logger!.warn(
        "Still no folder. Use File → Open Folder in this Extension Development Host window.",
      );
      logger!.show();
      void vscode.window
        .showWarningMessage(
          "Prism: this window has no folder. Open a folder here (not a new window).",
          "Open Folder…",
        )
        .then((pick) => {
          if (pick === "Open Folder…") {
            void vscode.commands.executeCommand(
              "workbench.action.files.openFolder",
            );
          }
        });
    }
  }, 250);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

/**
 * File-level Prism CodeLenses (M-048 Phase 2), gated behind
 * `prism.codeLens.enabled` (default off). Registers/disposes the provider as
 * the setting flips, so no reload is required.
 */
function registerCodeLens(context: vscode.ExtensionContext): void {
  let registration: vscode.Disposable | undefined;
  const provider = new PrismCodeLensProvider();

  const sync = (): void => {
    const enabled = vscode.workspace
      .getConfiguration("prism")
      .get<boolean>("codeLens.enabled", false);
    if (enabled && !registration) {
      registration = vscode.languages.registerCodeLensProvider(
        { scheme: "file" },
        provider,
      );
    } else if (!enabled && registration) {
      registration.dispose();
      registration = undefined;
    }
  };

  sync();
  context.subscriptions.push(
    provider,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("prism.codeLens.enabled")) {
        sync();
        // Keep Prism Settings toggle in sync if Cursor Settings changed it.
        PrismPanel.current?.postCodeLensEnabled();
      }
    }),
    { dispose: () => registration?.dispose() },
  );
}

/**
 * Open Prism and ask the webview to show the in-app product tour.
 * (No VS Code Getting Started pane — tour lives inside the Prism UI.)
 */
function openPrismWalkthrough(): void {
  void vscode.commands.executeCommand("prism.open").then(() => {
    PrismPanel.current?.postShowTour();
  });
}

export function activate(context: vscode.ExtensionContext): void {
  // Register commands first so palette entries work even if Core/sqlite fails later.
  logger = createLogger(vscode.window);
  extensionUri = context.extensionUri;
  extensionContext = context;

  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = "$(symbol-namespace) Prism";
  statusBar.tooltip = "Prism — Open dashboard";
  statusBar.command = "prism.statusBarMenu";
  statusBar.show();

  const statusBarMenu = vscode.commands.registerCommand(
    "prism.statusBarMenu",
    () => showStatusBarMenu(),
  );

  statusBarTimer = setInterval(updateStatusBar, 2500);

  const openPrism = vscode.commands.registerCommand("prism.open", async () => {
    try {
      const s = await ensureSession();
      if (!s || !extensionUri || !extensionContext) return;
      PrismPanel.show(
        vscode,
        extensionUri,
        s,
        logger!,
        extensionContext,
        "overview",
      );
      logger!.info("Opened Prism dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger?.error(msg);
      logger?.show();
      void vscode.window.showErrorMessage(`Prism: failed to open — ${msg}`);
    }
  });

  const openMap = vscode.commands.registerCommand(
    "prism.openRepositoryMap",
    async () => {
      try {
        const s = await ensureSession();
        if (!s || !extensionUri || !extensionContext) return;
        PrismPanel.show(
          vscode,
          extensionUri,
          s,
          logger!,
          extensionContext,
          "map",
        );
        logger!.info("Opened Repository Map");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger?.error(msg);
        logger?.show();
        void vscode.window.showErrorMessage(
          `Prism: failed to open map — ${msg}`,
        );
      }
    },
  );

  const showHealth = vscode.commands.registerCommand(
    "prism.showHealth",
    async () => {
      try {
        const s = await ensureSession();
        if (!s || !extensionUri) return;
        const dash = await s.getDashboard();
        if (!dash.ok) {
          void vscode.window.showErrorMessage(
            `Prism: health unavailable — ${dash.error.message}`,
          );
          return;
        }
        const h = dash.value.health;
        if (!h) {
          void vscode.window.showWarningMessage("Prism: no health score yet");
          return;
        }
        const pick = await vscode.window.showInformationMessage(
          `Prism health ${Math.round(h.score)}/100 (grade ${h.grade})`,
          "Open Overview",
        );
        if (pick === "Open Overview") {
          if (!extensionContext) return;
          PrismPanel.show(
            vscode,
            extensionUri,
            s,
            logger!,
            extensionContext,
            "overview",
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Prism: health failed — ${msg}`);
      }
    },
  );

  const reindex = vscode.commands.registerCommand("prism.reindex", async () => {
    try {
      if (session?.isOpen) {
        lastBootedRoot = null;
      }
      const s = await ensureSession();
      if (!s) return;
      statusBarBusy = true;
      statusBar!.text = "$(sync~spin) Prism: reindexing…";
      logger!.info("Reindex started");
      const result = await s.reindex();
      if (!result.ok) {
        statusBar!.text = "$(error) Prism";
        logger!.error(result.error.message);
        logger!.show();
        void vscode.window.showErrorMessage(
          `Prism: reindex failed — ${result.error.message}`,
        );
        return;
      }
      lastBootedRoot = s.root;
      logger!.info("Reindex complete");
      void vscode.window.showInformationMessage("Prism: reindex complete");
      if (PrismPanel.current) {
        PrismPanel.current.postNavigateRefresh();
      }
      void checkHealthRegression(vscode, s, extensionContext);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      statusBar!.text = "$(error) Prism";
      void vscode.window.showErrorMessage(`Prism: reindex failed — ${msg}`);
    } finally {
      statusBarBusy = false;
      updateStatusBar();
    }
  });

  const switchWorkspaceFolder = vscode.commands.registerCommand(
    "prism.switchWorkspaceFolder",
    async () => {
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length < 2) {
        void vscode.window.showInformationMessage(
          "Prism: only one workspace folder is open.",
        );
        return;
      }
      const pick = await vscode.window.showQuickPick(
        folders.map((f) => ({
          label: f.name,
          description: f.uri.fsPath,
          folder: f,
        })),
        { placeHolder: "Select a workspace folder for Prism to index" },
      );
      if (!pick) return;
      lastBootedRoot = null;
      statusBarBusy = true;
      statusBar!.text = "$(sync~spin) Prism: indexing…";
      try {
        if (!session) session = new PrismSession();
        const opened = await session.open(pick.folder.uri.fsPath);
        if (!opened.ok) {
          statusBar!.text = "$(error) Prism";
          void vscode.window.showErrorMessage(
            `Prism: failed to index — ${opened.error.message}`,
          );
          return;
        }
        lastBootedRoot = pick.folder.uri.fsPath;
        logger!.info(`Switched Prism workspace to ${pick.folder.uri.fsPath}`);
        if (PrismPanel.current) PrismPanel.current.postNavigateRefresh();
        void checkHealthRegression(vscode, session, extensionContext);
      } finally {
        statusBarBusy = false;
        updateStatusBar();
      }
    },
  );

  const openInBrowser = vscode.commands.registerCommand(
    "prism.openInBrowser",
    async () => {
      try {
        if (!extensionUri) return;
        const s = await ensureSession();
        if (!s) return;
        logger!.info("Opening Prism in browser (extension Core bridge)");
        await openPlaygroundInBrowser(vscode, {
          session: s,
          extensionRoot: extensionUri.fsPath,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
          `Prism: open in browser failed — ${msg}`,
        );
      }
    },
  );

  const openPanel = async (
    view: AppView,
    navigate?: Parameters<typeof PrismPanel.show>[6],
  ): Promise<void> => {
    const s = await ensureSession();
    if (!s || !extensionUri || !extensionContext) return;
    PrismPanel.show(
      vscode,
      extensionUri,
      s,
      logger!,
      extensionContext,
      view,
      navigate,
    );
  };

  const blastRadius = vscode.commands.registerCommand(
    "prism.blastRadius",
    async (arg: unknown) => {
      const path = resolveCommandTargetPath(arg);
      if (!path) {
        void vscode.window.showWarningMessage(
          "Prism: open or select a file first.",
        );
        return;
      }
      await openPanel("blast", { targetPath: path });
    },
  );

  const safeDelete = vscode.commands.registerCommand(
    "prism.safeDelete",
    async (arg: unknown) => {
      const path = resolveCommandTargetPath(arg);
      if (!path) {
        void vscode.window.showWarningMessage(
          "Prism: open or select a file first.",
        );
        return;
      }
      await openPanel("blast", { targetPath: path });
    },
  );

  const exploreOwnership = vscode.commands.registerCommand(
    "prism.exploreOwnership",
    async (arg: unknown) => {
      const path = resolveCommandTargetPath(arg);
      if (!path) {
        void vscode.window.showWarningMessage(
          "Prism: open or select a file first.",
        );
        return;
      }
      await openPanel("explain", { targetPath: path });
    },
  );

  const explainArea = vscode.commands.registerCommand(
    "prism.explainArea",
    async (arg: unknown) => {
      const path = resolveCommandTargetPath(arg);
      if (!path) {
        void vscode.window.showWarningMessage(
          "Prism: open or select a file first.",
        );
        return;
      }
      await openPanel("explain", { targetPath: path });
    },
  );

  const revealOnMap = vscode.commands.registerCommand(
    "prism.revealOnMap",
    async (arg: unknown) => {
      const path = resolveCommandTargetPath(arg);
      if (!path) {
        void vscode.window.showWarningMessage(
          "Prism: open or select a file first.",
        );
        return;
      }
      await openPanel("map", { focusPath: path });
    },
  );

  const reviewChanges = vscode.commands.registerCommand(
    "prism.reviewChanges",
    async (arg: unknown, selected: unknown) => {
      const scmPaths = resolveScmTargetPaths(arg, selected);
      const paths =
        scmPaths.length > 0
          ? scmPaths
          : (() => {
              const single = resolveCommandTargetPath(arg);
              return single ? [single] : [];
            })();
      if (paths.length === 0) {
        void vscode.window.showWarningMessage(
          "Prism: select one or more changed files first.",
        );
        return;
      }
      await openPanel("review", { targetPaths: paths });
    },
  );

  const openWalkthrough = vscode.commands.registerCommand(
    "prism.openWalkthrough",
    () => {
      openPrismWalkthrough();
    },
  );

  context.subscriptions.push(
    openPrism,
    openMap,
    showHealth,
    reindex,
    openInBrowser,
    blastRadius,
    safeDelete,
    exploreOwnership,
    explainArea,
    revealOnMap,
    reviewChanges,
    openWalkthrough,
    statusBarMenu,
    switchWorkspaceFolder,
    statusBar,
    {
      dispose: () => {
        BrowserBridge.dispose();
        if (statusBarTimer) clearInterval(statusBarTimer);
        session?.close();
        logger?.dispose();
      },
    },
  );

  registerCodeLens(context);

  try {
    session = new PrismSession();
    logger.info(`${PACKAGE_NAME} activated`);
    watchForFolder(context);
    queueBoot();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    statusBar.text = "$(error) Prism";
    logger.error(`Activation boot failed: ${msg}`);
    logger.show();
    void vscode.window.showErrorMessage(
      `Prism activated with limited functionality — ${msg}`,
    );
  }
}

export function deactivate(): void {
  BrowserBridge.dispose();
  if (statusBarTimer) clearInterval(statusBarTimer);
  session?.close();
  session = undefined;
  PrismPanel.current?.dispose();
}
