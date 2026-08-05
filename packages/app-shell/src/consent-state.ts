import {
  CONSENT_PURPOSES,
  type ConsentPurposeId,
  type ConsentState,
} from "@prism/shared";
import { useSyncExternalStore } from "react";
import type { AppShellClient } from "./client.js";
import { loadSettings, saveSettings } from "./settings-store.js";

/**
 * The webview's view of `.prism/consent.json` (M-036 Phase 1.1).
 *
 * Screens used to consult `allowNetworkIntegrations` in `localStorage`, which
 * made the browser the authority over what Core was allowed to do — so an SDK,
 * MCP or CLI caller was bound by nothing, and two disagreeing consent systems
 * existed at once. This module is a *cache* of Core's answer, never a second
 * source of truth: nothing here decides anything, and an unloaded snapshot
 * denies rather than allows.
 */

/** Undecided for every purpose. The starting point, and the fallback. */
function emptyState(): readonly ConsentState[] {
  return CONSENT_PURPOSES.map((purpose) => ({
    purpose,
    granted: false,
    decidedAt: null,
  }));
}

let snapshot: readonly ConsentState[] = emptyState();
const listeners = new Set<() => void>();

function publish(next: readonly ConsentState[]): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Read the current snapshot without subscribing (for event handlers). */
export function consentSnapshot(): readonly ConsentState[] {
  return snapshot;
}

export function isConsentGranted(purpose: ConsentPurposeId): boolean {
  return snapshot.some(
    (state) => state.purpose.id === purpose && state.granted,
  );
}

/** Subscribe a component to the whole snapshot. */
export function useConsentState(): readonly ConsentState[] {
  return useSyncExternalStore(subscribe, consentSnapshot, consentSnapshot);
}

/** Subscribe a component to one purpose. */
export function useConsentGranted(purpose: ConsentPurposeId): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isConsentGranted(purpose),
    () => false,
  );
}

/**
 * One-time migration of the old browser toggle (M-036 Phase 1.4).
 *
 * The prior setting was a single "allow network integrations" switch. It is
 * honoured once, for the network purposes it plausibly covered, and then
 * ignored forever. `network.gravatar` is deliberately excluded: nobody who
 * flipped that switch was told it meant sending committer email hashes to a
 * third party, so treating it as consent would be inventing agreement.
 */
const MIGRATED_PURPOSES: readonly ConsentPurposeId[] = [
  "network.github",
  "network.pagespeed",
];

async function migrateLegacyToggle(client: AppShellClient): Promise<void> {
  const settings = loadSettings();
  if (settings.consentMigratedAt || !settings.allowNetworkIntegrations) {
    // Stamp regardless, so a user who never enabled it is not re-checked on
    // every load.
    if (!settings.consentMigratedAt) {
      saveSettings({ consentMigratedAt: new Date().toISOString() });
    }
    return;
  }
  for (const purpose of MIGRATED_PURPOSES) {
    if (isConsentGranted(purpose)) continue;
    await client.setConsent?.(purpose, true);
  }
  saveSettings({ consentMigratedAt: new Date().toISOString() });
}

/**
 * Load the snapshot from Core, migrating the legacy toggle on first run.
 * Safe to call repeatedly; a host without `listConsent` leaves everything
 * denied.
 */
export async function refreshConsent(client: AppShellClient): Promise<void> {
  if (!client.listConsent) {
    publish(emptyState());
    return;
  }
  try {
    publish(await client.listConsent());
    await migrateLegacyToggle(client);
    publish(await client.listConsent());
  } catch {
    // A host that cannot answer is not a host that grants.
    publish(emptyState());
  }
}

/** Record a decision through Core and refresh the cache from the result. */
export async function setConsent(
  client: AppShellClient,
  purpose: ConsentPurposeId,
  granted: boolean,
): Promise<void> {
  if (!client.setConsent) return;
  publish(await client.setConsent(purpose, granted));
}
