/**
 * Apply P4 session dedupe to prepare_change (and similar list responses).
 */

import type { ContextFile, PrepareChange } from "./schemas.js";
import {
  contentKey,
  decideSend,
  readSessionStore,
  recordSent,
  writeSessionStore,
  type SessionStore,
} from "./session-store.js";

export type PrepareDedupeOptions = {
  readonly sessionId: string;
  readonly refresh?: boolean;
  /** path → content hash (from index). Missing → hash signatures text. */
  readonly fileHashes?: ReadonlyMap<string, string> | Record<string, string>;
  readonly env?: NodeJS.ProcessEnv;
};

function hashFor(
  file: ContextFile,
  fileHashes: PrepareDedupeOptions["fileHashes"],
): string {
  let fromIndex: string | undefined;
  if (fileHashes instanceof Map) {
    fromIndex = fileHashes.get(file.path);
  } else if (
    fileHashes &&
    Object.prototype.hasOwnProperty.call(fileHashes, file.path)
  ) {
    fromIndex = (fileHashes as Record<string, string>)[file.path];
  }
  if (fromIndex)
    return fromIndex.length >= 8
      ? fromIndex.slice(0, 16)
      : contentKey(fromIndex);
  return contentKey(
    JSON.stringify({
      path: file.path,
      signatures: file.signatures ?? [],
      symbols: file.symbols,
    }),
  );
}

function stubFile(file: ContextFile, turn: number): ContextFile {
  return {
    path: file.path,
    symbols: [],
    signatures: [],
    why: [`sent earlier at turn ${turn}, unchanged`],
    confidence: file.confidence ?? "medium",
    tokenWeight: Math.max(
      1,
      Math.ceil(`${file.path} sent earlier unchanged`.length / 4),
    ),
    provenance: file.provenance,
  };
}

/**
 * Replace already-sent unchanged pack files with a short reference and
 * record newly sent ones. No sessionId → caller should skip this.
 */
export function dedupePrepareChange(
  prep: PrepareChange,
  opts: PrepareDedupeOptions,
): { readonly prep: PrepareChange; readonly store: SessionStore } {
  let store = readSessionStore(opts.sessionId, opts.env);
  if (opts.refresh) {
    store = {
      ...store,
      turn: store.turn,
      sent: {},
      updatedAt: new Date().toISOString(),
    };
  }
  const files: ContextFile[] = [];
  for (const file of prep.pack.files) {
    const hash = hashFor(file, opts.fileHashes);
    const decision = decideSend(store, file.path, hash, false);
    if (decision.status === "skip") {
      files.push(stubFile(file, decision.turn));
      continue;
    }
    files.push(file);
    store = recordSent(store, file.path, hash, "file");
  }
  writeSessionStore(store, opts.env);
  const tokenEstimate = files.reduce((n, f) => n + f.tokenWeight, 0);
  return {
    prep: {
      ...prep,
      pack: {
        ...prep.pack,
        files,
        tokenEstimate,
      },
    },
    store,
  };
}
