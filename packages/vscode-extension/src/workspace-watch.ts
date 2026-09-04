import type * as vscode from "vscode";
import type { PrismLogger } from "./logger.js";
import type { PrismSession } from "@repo-prism/host-session";

export const AUTO_REINDEX_STATE_KEY = "prism.autoReindex";
export const AUTO_REINDEX_INTERVAL_STATE_KEY = "prism.autoReindexIntervalMs";
/** M-057 P-B1 — auto re-index is on unless the user has turned it off. */
export const DEFAULT_AUTO_REINDEX = true;
export const MIN_REINDEX_DEBOUNCE_MS = 1500;

/** Resolve persisted preference; missing means the product default (on). */
export function resolveAutoReindexEnabled(
  stored: boolean | undefined,
): boolean {
  return stored ?? DEFAULT_AUTO_REINDEX;
}

/** Repo-relative forward-slashed path for a watched URI. */
export function toRepoRelativePath(
  asRelativePath: (uri: vscode.Uri, includeWorkspaceFolder?: boolean) => string,
  uri: vscode.Uri,
): string {
  return asRelativePath(uri, false).replace(/\\/g, "/");
}

export type WorkspaceWatchHost = {
  createFileSystemWatcher: typeof vscode.workspace.createFileSystemWatcher;
  RelativePattern: typeof vscode.RelativePattern;
  asRelativePath: typeof vscode.workspace.asRelativePath;
};

/**
 * Activation-owned FS watch → Core `notifyWatchPaths` (M-057 P-B1).
 * Independent of the Prism panel so the status bar stays honest with the
 * panel closed.
 */
export class WorkspaceWatchController {
  private watcher: vscode.FileSystemWatcher | undefined;
  private debounceMs = MIN_REINDEX_DEBOUNCE_MS;
  private onChange: (() => void) | undefined;

  constructor(
    private readonly host: WorkspaceWatchHost,
    private readonly getSession: () => PrismSession | undefined,
    private readonly log: PrismLogger,
  ) {}

  setOnChange(cb: (() => void) | undefined): void {
    this.onChange = cb;
  }

  setEnabled(enabled: boolean, intervalMs?: number): void {
    this.disposeWatcherOnly();
    const session = this.getSession();
    if (!session?.isOpen) {
      this.log.info("Watch requested but no session");
      return;
    }
    if (!enabled) {
      session.stopWatch();
      this.log.info("Auto Re-Index / watch off");
      return;
    }
    if (typeof intervalMs === "number" && Number.isFinite(intervalMs)) {
      this.debounceMs = Math.max(MIN_REINDEX_DEBOUNCE_MS, intervalMs);
    }
    const root = session.root;
    if (!root) return;

    const started = session.startWatch({
      debounceMs: this.debounceMs,
      onChange: () => this.onChange?.(),
    });
    if (!started.ok) {
      this.log.warn(`startWatch failed: ${started.error.message}`);
      return;
    }

    const pattern = new this.host.RelativePattern(root, "**/*");
    const watcher = this.host.createFileSystemWatcher(pattern);
    const notify = (uri: vscode.Uri, deleted: boolean): void => {
      const rel = toRepoRelativePath(this.host.asRelativePath, uri);
      if (!rel) return;
      session.notifyWatchPaths(
        deleted ? { deletedPaths: [rel] } : { changedPaths: [rel] },
      );
      this.onChange?.();
    };
    watcher.onDidCreate((uri) => notify(uri, false));
    watcher.onDidChange((uri) => notify(uri, false));
    watcher.onDidDelete((uri) => notify(uri, true));
    this.watcher = watcher;
    this.log.info(
      `Watch on — Core dirty-set reindex (debounce ${Math.round(
        this.debounceMs / 1000,
      )}s)`,
    );
  }

  dispose(): void {
    this.disposeWatcherOnly();
    this.getSession()?.stopWatch();
  }

  private disposeWatcherOnly(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = undefined;
    }
  }
}

let activeWatch: WorkspaceWatchController | undefined;

export function setActiveWorkspaceWatch(
  controller: WorkspaceWatchController | undefined,
): void {
  activeWatch = controller;
}

export function getActiveWorkspaceWatch():
  | WorkspaceWatchController
  | undefined {
  return activeWatch;
}
