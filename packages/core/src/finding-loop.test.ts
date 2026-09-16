import { createFixture } from "@repo-prism/test-support";
import { describe, expect, it } from "vitest";
import { Prism } from "./prism.js";

describe("workspace listFindings / resolveFinding (M-071 Finding Loop)", () => {
  it("flags an unused export, and clears it only once a re-scan confirms the fingerprint is gone", async () => {
    const fixture = await createFixture({ name: "m071-finding" });
    try {
      await fixture.write(
        "src/lruCache.ts",
        "export function lruCache(): void {}\n",
      );
      await fixture.write("src/app.ts", 'export const app = "app";\n');
      fixture.commit("initial");

      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const workspace = opened.value;
      const indexed = await workspace.index();
      expect(indexed.ok).toBe(true);
      if (!indexed.ok) return;

      const before = workspace.listFindings();
      expect(before.ok).toBe(true);
      if (!before.ok) return;
      const finding = before.value.findings.find(
        (f) => f.source === "unused_export" && f.path === "src/lruCache.ts",
      );
      expect(finding).toBeDefined();
      if (!finding) return;

      const stillOpen = await workspace.resolveFinding({
        fingerprint: finding.fingerprint,
      });
      expect(stillOpen.ok).toBe(true);
      if (stillOpen.ok) expect(stillOpen.value.resolved).toBe(false);

      // The "stub worker": delete the unused export in the tree, as a fix job
      // would. Resolution must come from re-scanning, never from a job being
      // marked done.
      await fixture.write("src/lruCache.ts", "export {};\n");
      fixture.commit("remove unused export");

      const after = await workspace.resolveFinding({
        fingerprint: finding.fingerprint,
      });
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.value.resolved).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an empty fingerprint instead of silently resolving", async () => {
    const fixture = await createFixture({ name: "m071-finding-validation" });
    try {
      await fixture.write("src/app.ts", 'export const app = "app";\n');
      fixture.commit("initial");
      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const workspace = opened.value;
      const indexed = await workspace.index();
      expect(indexed.ok).toBe(true);
      if (!indexed.ok) return;

      const result = await workspace.resolveFinding({ fingerprint: "  " });
      expect(result.ok).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
