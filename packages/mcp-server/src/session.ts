/**
 * One workspace per process, opened and indexed on first use (M-026).
 *
 * Indexing during `initialize` would make every handshake look slow — and a
 * slow handshake reads as a broken server — so the cost is paid on the first
 * tool call instead, and only once. An agent that calls six tools indexes once.
 */

import { stat } from "node:fs/promises";
import { Prism, type PrismWorkspace } from "@prism/core";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";

export type WorkspaceSession = {
  /** The opened, indexed workspace. Indexes on the first call only. */
  ready(): Promise<Result<PrismWorkspace, PrismError>>;
  /** Whether the workspace has been opened yet (for tests and diagnostics). */
  isOpen(): boolean;
  close(): void;
};

export type SessionOptions = {
  readonly root: string;
  /** Injectable for tests; defaults to the real Core client. */
  readonly openWorkspace?: (root: string) => Result<PrismWorkspace, PrismError>;
};

function defaultOpen(root: string): Result<PrismWorkspace, PrismError> {
  return Prism.create().openRepository(root);
}

/**
 * Create the session. Nothing happens until `ready()` is awaited — construction
 * must stay cheap because it runs before the client has finished connecting.
 */
export function createWorkspaceSession(
  options: SessionOptions,
): WorkspaceSession {
  const open = options.openWorkspace ?? defaultOpen;

  let workspace: PrismWorkspace | undefined;
  // Cached so that concurrent first calls await one index rather than racing
  // into several. Cleared on failure so a transient error is retryable.
  let pending: Promise<Result<PrismWorkspace, PrismError>> | undefined;

  async function openAndIndex(): Promise<Result<PrismWorkspace, PrismError>> {
    const directory = await assertDirectory(options.root);
    if (!directory.ok) return directory;

    const opened = open(options.root);
    if (!opened.ok) return opened;

    const indexed = await opened.value.index();
    if (!indexed.ok) {
      opened.value.close();
      return err(indexed.error);
    }

    workspace = opened.value;
    return ok(opened.value);
  }

  return {
    async ready() {
      if (workspace !== undefined) return ok(workspace);
      if (pending === undefined) {
        pending = openAndIndex().finally(() => {
          // Only keep the memo when it produced a workspace; a failed open
          // should not poison every later call in a long-lived process.
          if (workspace === undefined) pending = undefined;
        });
      }
      return pending;
    },
    isOpen() {
      return workspace !== undefined;
    },
    close() {
      workspace?.close();
      workspace = undefined;
      pending = undefined;
    },
  };
}

async function assertDirectory(
  root: string,
): Promise<Result<true, PrismError>> {
  try {
    const stats = await stat(root);
    if (!stats.isDirectory()) {
      return err(
        prismError(
          PrismErrorCode.INVALID_PATH,
          `Workspace path is not a directory: ${root}`,
        ),
      );
    }
    return ok(true);
  } catch (cause) {
    return err(
      prismError(
        PrismErrorCode.INVALID_PATH,
        `Workspace path is not readable: ${root}`,
        { cause: String(cause) },
      ),
    );
  }
}
