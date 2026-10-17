/**
 * Per-session "already sent" store (P4). Hashes and ids only — no file content.
 * Lives at ~/.prism/sessions/<sessionId>.json; TTL 24 h.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { prismHomeDir } from "./prism-home.js";

export const SESSION_STORE_SCHEMA = 1 as const;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type SessionSentKind = "file" | "symbol";

export type SessionSentEntry = {
  readonly hash: string;
  readonly turn: number;
  readonly kind: SessionSentKind;
};

export type SessionStore = {
  readonly schemaVersion: typeof SESSION_STORE_SCHEMA;
  readonly sessionId: string;
  readonly updatedAt: string;
  readonly turn: number;
  /** Key: repo-relative path or `path#symbol`. */
  readonly sent: Record<string, SessionSentEntry>;
};

export function sessionsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHomeDir(env), "sessions");
}

export function sessionStorePath(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return join(sessionsDir(env), `${safe}.json`);
}

export function emptySessionStore(
  sessionId: string,
  now = new Date(),
): SessionStore {
  return {
    schemaVersion: SESSION_STORE_SCHEMA,
    sessionId,
    updatedAt: now.toISOString(),
    turn: 0,
    sent: {},
  };
}

export function readSessionStore(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): SessionStore {
  const path = sessionStorePath(sessionId, env);
  if (!existsSync(path)) return emptySessionStore(sessionId, now);
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as SessionStore;
    if (
      raw.schemaVersion !== SESSION_STORE_SCHEMA ||
      raw.sessionId !== sessionId ||
      typeof raw.sent !== "object"
    ) {
      return emptySessionStore(sessionId, now);
    }
    const age = now.getTime() - Date.parse(raw.updatedAt);
    if (!Number.isFinite(age) || age > SESSION_TTL_MS) {
      return emptySessionStore(sessionId, now);
    }
    return raw;
  } catch {
    return emptySessionStore(sessionId, now);
  }
}

export function writeSessionStore(
  store: SessionStore,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const dir = sessionsDir(env);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    sessionStorePath(store.sessionId, env),
    `${JSON.stringify(store)}\n`,
    "utf8",
  );
}

/** Content-address for a file (or any string payload). */
export function contentKey(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export type DedupeDecision =
  | { readonly status: "send"; readonly hash: string }
  | { readonly status: "skip"; readonly hash: string; readonly turn: number };

export function decideSend(
  store: SessionStore,
  key: string,
  hash: string,
  refresh: boolean,
): DedupeDecision {
  if (refresh) return { status: "send", hash };
  const prior = store.sent[key];
  if (prior && prior.hash === hash) {
    return { status: "skip", hash, turn: prior.turn };
  }
  return { status: "send", hash };
}

export function recordSent(
  store: SessionStore,
  key: string,
  hash: string,
  kind: SessionSentKind,
  now = new Date(),
): SessionStore {
  const turn = store.turn + 1;
  return {
    schemaVersion: SESSION_STORE_SCHEMA,
    sessionId: store.sessionId,
    updatedAt: now.toISOString(),
    turn,
    sent: {
      ...store.sent,
      [key]: { hash, turn, kind },
    },
  };
}

/** Drop session files older than TTL. Returns deleted paths. */
export function pruneSessionStores(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): string[] {
  const dir = sessionsDir(env);
  if (!existsSync(dir)) return [];
  const deleted: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    try {
      const st = statSync(path);
      if (now.getTime() - st.mtimeMs > SESSION_TTL_MS) {
        rmSync(path, { force: true });
        deleted.push(path);
        continue;
      }
      const raw = JSON.parse(readFileSync(path, "utf8")) as {
        updatedAt?: string;
      };
      const age = now.getTime() - Date.parse(raw.updatedAt ?? "");
      if (!Number.isFinite(age) || age > SESSION_TTL_MS) {
        rmSync(path, { force: true });
        deleted.push(path);
      }
    } catch {
      rmSync(path, { force: true });
      deleted.push(path);
    }
  }
  return deleted;
}

/** Privacy: store must never hold file bodies or signature text. */
export function sessionStoreIsHashesOnly(store: SessionStore): boolean {
  for (const [key, entry] of Object.entries(store.sent)) {
    if (key.length > 512) return false;
    if (!/^[a-f0-9]{8,64}$/i.test(entry.hash)) return false;
    if (typeof entry.turn !== "number") return false;
  }
  return true;
}
