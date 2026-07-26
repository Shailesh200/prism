import * as vscode from "vscode";
import { dirname } from "node:path";
import { BrowserBridge } from "./browser-bridge.js";
import { createLogger } from "./logger.js";
import { openPlaygroundInBrowser } from "./open-playground.js";
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

function folderPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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

  statusBar!.text = "$(sync~spin) Prism: indexing…";
  logger!.info(`Opening workspace ${folder.uri.fsPath}`);
  logger!.show();
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
  }
  statusBar!.text = "$(symbol-namespace) Prism";
  lastBootedRoot = folder.uri.fsPath;
  logger!.info("Index ready");
  return session;
}

async function bootWorkspace(opts?: { announce?: boolean }): Promise<void> {
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

  statusBar!.tooltip = `Prism — ${folder.name} (click to open)`;
  if (opts?.announce) {
    if (!extensionUri || !extensionContext) return;
    // Open the dashboard automatically after a successful first index so
    // install → activate → index does not require an extra click.
    PrismPanel.show(
      vscode,
      extensionUri,
      s,
      logger!,
      extensionContext,
      "overview",
    );
    logger!.info(`Opened Prism dashboard for ${folder.name}`);
    void vscode.window
      .showInformationMessage(`Prism indexed ${folder.name}`, "Open Map")
      .then((pick) => {
        if (pick === "Open Map" && extensionUri && extensionContext) {
          PrismPanel.show(
            vscode,
            extensionUri,
            s,
            logger!,
            extensionContext,
            "map",
          );
        }
      });
  }
}

function queueBoot(opts?: { announce?: boolean }): void {
  bootChain = bootChain
    .then(() => bootWorkspace(opts))
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
    queueBoot({ announce: true });
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
  statusBar.command = "prism.open";
  statusBar.show();

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
      statusBar!.text = "$(symbol-namespace) Prism";
      logger!.info("Reindex complete");
      void vscode.window.showInformationMessage("Prism: reindex complete");
      if (PrismPanel.current) {
        PrismPanel.current.postNavigateRefresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      statusBar!.text = "$(error) Prism";
      void vscode.window.showErrorMessage(`Prism: reindex failed — ${msg}`);
    }
  });

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

  context.subscriptions.push(
    openPrism,
    openMap,
    showHealth,
    reindex,
    openInBrowser,
    statusBar,
    {
      dispose: () => {
        BrowserBridge.dispose();
        session?.close();
        logger?.dispose();
      },
    },
  );

  try {
    session = new PrismSession();
    logger.info(`${PACKAGE_NAME} activated`);
    logger.show();
    watchForFolder(context);
    queueBoot({ announce: true });
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
  session?.close();
  session = undefined;
  PrismPanel.current?.dispose();
}
