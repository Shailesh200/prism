import type { CwvReport, UtilityOverlayReport } from "@repo-prism/shared";

/**
 * Local persistence for domain screens so reopening a domain shows the
 * last-synced data without auto-re-running analysis (M-046 follow-up #5/#14).
 * Everything is namespaced per repo + domain and kept local (no network).
 */
export function domainStoreKey(
  repoLabel: string,
  domainId: string,
  slot: string,
): string {
  return `prism:dm:${repoLabel}:${domainId}:${slot}`;
}

export function readStore<T>(key: string): T | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** Persisted Frontend CWV snapshot (survives tab switches). */
export type CwvSnapshot = {
  local: CwvReport | null;
  pagespeed: CwvReport | null;
  tbtMs: number | null;
  at: number;
  fellBack: boolean;
};

/** Persisted overlay run so reopening shows last-synced data (all domains). */
export type OverlaySnapshot = {
  overlay: UtilityOverlayReport;
  at: number;
};
