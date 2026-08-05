import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONSENT_PURPOSES } from "@prism/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createConsentStore } from "./consent.js";

/**
 * The consent store is the single authority for everything Prism will not do
 * unprompted (M-036 Phase 1). Its whole value is in refusing, so these tests
 * are mostly about the refusals.
 */
describe("consent store", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "prism-consent-"));
  });

  it("refuses every purpose on a fresh workspace", async () => {
    const store = createConsentStore({ workspaceRoot: root });
    for (const purpose of CONSENT_PURPOSES) {
      const gate = await store.requireGranted(purpose.id);
      expect(gate.ok).toBe(false);
    }
  });

  it("names what would happen when it refuses", async () => {
    const store = createConsentStore({ workspaceRoot: root });
    const gate = await store.requireGranted("network.github");
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    // "Consent required" on its own tells a user nothing about what they are
    // being asked to agree to.
    expect(gate.error.message).toContain("api.github.com");
    expect(gate.error.message).toContain("network.github");
  });

  it("grants only the purpose that was decided", async () => {
    const store = createConsentStore({ workspaceRoot: root });
    await store.set("network.github", true);

    expect((await store.requireGranted("network.github")).ok).toBe(true);
    for (const purpose of CONSENT_PURPOSES) {
      if (purpose.id === "network.github") continue;
      expect((await store.requireGranted(purpose.id)).ok).toBe(false);
    }
  });

  it("treats an explicit denial as a denial, not as undecided", async () => {
    const store = createConsentStore({ workspaceRoot: root });
    await store.set("network.gravatar", true);
    await store.set("network.gravatar", false);
    expect((await store.requireGranted("network.gravatar")).ok).toBe(false);
  });

  it("rejects a purpose it does not know, rather than storing it", async () => {
    const store = createConsentStore({ workspaceRoot: root });
    const set = await store.set("network.anything-goes", true);
    expect(set.ok).toBe(false);

    // A typo must not become an unprompted allow the moment a matching record
    // appears — by hand, or from a future version's vocabulary.
    const gate = await store.requireGranted("network.anything-goes");
    expect(gate.ok).toBe(false);
    expect((await store.list()).ok && (await store.list())).toBeTruthy();
  });

  it("ignores a hand-written record for an unknown purpose", async () => {
    await mkdir(join(root, ".prism"), { recursive: true });
    await writeFile(
      join(root, ".prism", "consent.json"),
      JSON.stringify({
        records: [
          {
            purpose: "network.everything",
            granted: true,
            decidedAt: new Date().toISOString(),
          },
        ],
      }),
      "utf8",
    );

    const store = createConsentStore({ workspaceRoot: root });
    expect((await store.requireGranted("network.everything")).ok).toBe(false);
  });

  it("is last-write-wins per purpose, not append-only", async () => {
    const store = createConsentStore({ workspaceRoot: root });
    await store.set("network.github", true);
    await store.set("network.github", false);

    const raw = JSON.parse(
      await readFile(join(root, ".prism", "consent.json"), "utf8"),
    ) as { records: unknown[] };
    expect(raw.records).toHaveLength(1);
  });

  it("survives a corrupt file by denying rather than throwing", async () => {
    await mkdir(join(root, ".prism"), { recursive: true });
    await writeFile(join(root, ".prism", "consent.json"), "{not json", "utf8");

    const store = createConsentStore({ workspaceRoot: root });
    expect((await store.requireGranted("network.github")).ok).toBe(false);
    expect((await store.list()).ok).toBe(true);
  });
});
