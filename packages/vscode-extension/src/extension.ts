import * as vscode from "vscode";
import { dirname } from "node:path";
import { createLogger } from "./logger.js";
import { PrismSession } from "./session.js";
import { MapPanel } from "./webview/map-panel.js";

export const PACKAGE_NAME = "@prism/vscode-extension" as const;

const AUTO_OPEN_STATE_KEY = "prism.autoOpenFolderAttempts";

let session: PrismSession | undefined;
let logger: ReturnType<typeof createLogger> | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let extensionUri: vscode.Uri | undefined;
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

  statusBar!.tooltip = `Prism — ${folder.name} (click for map)`;
  if (opts?.announce) {
    const pick = await vscode.window.showInformationMessage(
      `Prism indexed ${folder.name}`,
      "Open Repository Map",
    );
    if (pick === "Open Repository Map" && extensionUri) {
      MapPanel.show(vscode, extensionUri, s, logger!);
    }
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
  logger = createLogger(vscode.window);
  session = new PrismSession();
  extensionUri = context.extensionUri;

  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = "$(symbol-namespace) Prism";
  statusBar.tooltip = "Prism — Open Repository Map";
  statusBar.command = "prism.openRepositoryMap";
  statusBar.show();

  const openMap = vscode.commands.registerCommand(
    "prism.openRepositoryMap",
    async () => {
      const s = await ensureSession();
      if (!s || !extensionUri) return;
      MapPanel.show(vscode, extensionUri, s, logger!);
      logger!.info("Opened Repository Map webview");
    },
  );

  const reindex = vscode.commands.registerCommand("prism.reindex", async () => {
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
    if (MapPanel.current) await MapPanel.current.pushMap();
  });

  context.subscriptions.push(openMap, reindex, statusBar, {
    dispose: () => {
      session?.close();
      logger?.dispose();
    },
  });

  logger.info(`${PACKAGE_NAME} activated`);
  logger.show();
  watchForFolder(context);
  queueBoot({ announce: true });
}

export function deactivate(): void {
  session?.close();
  session = undefined;
  MapPanel.current?.dispose();
}
