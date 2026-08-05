import { CONSENT_PURPOSES, type ConsentPurposeId } from "@repo-prism/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppShellClient } from "./client.js";
import {
  consentSnapshot,
  isConsentGranted,
  refreshConsent,
  setConsent,
} from "./consent-state.js";
import { loadSettings, saveSettings } from "./settings-store.js";

/**
 * This module caches Core's answer about what the user has permitted. The
 * property that matters is that it is only ever a cache: when it cannot reach
 * Core, or Core says something unexpected, the answer must be "no".
 */

function fakeClient(granted: Set<ConsentPurposeId> = new Set()) {
  const list = () =>
    CONSENT_PURPOSES.map((purpose) => ({
      purpose,
      granted: granted.has(purpose.id),
      decidedAt: granted.has(purpose.id) ? "2026-01-01T00:00:00.000Z" : null,
    }));

  return {
    granted,
    setCalls: [] as { purpose: string; granted: boolean }[],
    client: {
      listConsent: vi.fn(async () => list()),
      setConsent: vi.fn(async (purpose: ConsentPurposeId, value: boolean) => {
        if (value) granted.add(purpose);
        else granted.delete(purpose);
        return list();
      }),
    } as unknown as AppShellClient,
  };
}

beforeEach(async () => {
  globalThis.localStorage.clear();
  await refreshConsent({} as AppShellClient);
});

describe("loading the snapshot", () => {
  it("reports every known purpose, so a new one cannot be silently missing", async () => {
    const { client } = fakeClient();
    await refreshConsent(client);

    expect(
      consentSnapshot()
        .map((s) => s.purpose.id)
        .sort(),
    ).toEqual(CONSENT_PURPOSES.map((p) => p.id).sort());
  });

  it("reflects what Core granted", async () => {
    const { client } = fakeClient(
      new Set<ConsentPurposeId>(["network.github"]),
    );
    await refreshConsent(client);

    expect(isConsentGranted("network.github")).toBe(true);
    expect(isConsentGranted("network.pagespeed")).toBe(false);
  });

  it("denies everything when the host cannot answer at all", async () => {
    // A host with no listConsent is an older or partial surface. Treating a
    // missing answer as permission is the failure mode worth ruling out.
    await refreshConsent({} as AppShellClient);

    expect(consentSnapshot().every((s) => !s.granted)).toBe(true);
  });

  it("denies everything when the host throws", async () => {
    const client = {
      listConsent: vi.fn(async () => {
        throw new Error("host went away");
      }),
    } as unknown as AppShellClient;

    await refreshConsent(client);

    expect(consentSnapshot().every((s) => !s.granted)).toBe(true);
  });

  it("drops back to denied if a later refresh fails after a grant", async () => {
    const granted = new Set<ConsentPurposeId>(["network.github"]);
    const { client } = fakeClient(granted);
    await refreshConsent(client);
    expect(isConsentGranted("network.github")).toBe(true);

    await refreshConsent({
      listConsent: async () => {
        throw new Error("gone");
      },
    } as unknown as AppShellClient);

    expect(isConsentGranted("network.github")).toBe(false);
  });
});

describe("recording a decision", () => {
  it("asks Core and adopts the result rather than assuming it worked", async () => {
    const { client } = fakeClient();
    await refreshConsent(client);

    await setConsent(client, "network.pagespeed", true);

    expect(isConsentGranted("network.pagespeed")).toBe(true);
  });

  it("can withdraw a grant", async () => {
    const { client } = fakeClient(
      new Set<ConsentPurposeId>(["network.pagespeed"]),
    );
    await refreshConsent(client);

    await setConsent(client, "network.pagespeed", false);

    expect(isConsentGranted("network.pagespeed")).toBe(false);
  });

  it("does nothing on a host that cannot record decisions", async () => {
    // Better a toggle that does not move than one that moves and lies.
    await refreshConsent({} as AppShellClient);
    await setConsent({} as AppShellClient, "network.github", true);

    expect(isConsentGranted("network.github")).toBe(false);
  });
});

describe("the one-time migration from the old browser toggle", () => {
  it("carries over the purposes the old switch plausibly covered", async () => {
    saveSettings({ allowNetworkIntegrations: true });
    const { client } = fakeClient();

    await refreshConsent(client);

    expect(isConsentGranted("network.github")).toBe(true);
    expect(isConsentGranted("network.pagespeed")).toBe(true);
  });

  it("does not carry over gravatar", async () => {
    // Nobody who flipped "allow network integrations" was told it meant
    // sending committer email hashes to a third party. Migrating it would be
    // inventing agreement that was never given.
    saveSettings({ allowNetworkIntegrations: true });
    const { client } = fakeClient();

    await refreshConsent(client);

    expect(isConsentGranted("network.gravatar")).toBe(false);
  });

  it("grants nothing when the old toggle was off", async () => {
    saveSettings({ allowNetworkIntegrations: false });
    const { client } = fakeClient();

    await refreshConsent(client);

    expect(consentSnapshot().every((s) => !s.granted)).toBe(true);
  });

  it("runs once, so a later withdrawal is not undone on the next load", async () => {
    saveSettings({ allowNetworkIntegrations: true });
    const fake = fakeClient();
    await refreshConsent(fake.client);
    expect(isConsentGranted("network.github")).toBe(true);

    await setConsent(fake.client, "network.github", false);
    await refreshConsent(fake.client);

    // Re-running the migration would resurrect a permission the user just
    // turned off — the toggle would appear not to work.
    expect(isConsentGranted("network.github")).toBe(false);
  });

  it("stamps itself even when there was nothing to migrate", async () => {
    const { client } = fakeClient();
    await refreshConsent(client);

    // Otherwise every load re-reads and re-considers a legacy setting that
    // will never apply.
    expect(loadSettings().consentMigratedAt).toBeTruthy();
  });
});
