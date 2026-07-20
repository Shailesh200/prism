import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StackDomain } from "@prism/shared";
import { UTILITY_JOB_ECHO } from "@prism/intelligence";
import { Prism } from "./prism.js";

const monoFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m013-mono",
);

describe("M-041 Mono-v1 Core package selector", () => {
  it("lists packages, selects one, scopes stack + utility packageId", async () => {
    const client = Prism.create();
    const opened = client.openRepository(monoFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const packages = await ws.listPackages();
    expect(packages.ok).toBe(true);
    if (!packages.ok) return;
    expect(packages.value.some((p) => p.id === "@prism-fixture/m013-web")).toBe(
      true,
    );

    const selected = await ws.selectPackage("@prism-fixture/m013-web");
    expect(selected.ok).toBe(true);
    const current = ws.getSelectedPackage();
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value).toBe("@prism-fixture/m013-web");

    const scoped = await ws.getStackProfile();
    expect(scoped.ok).toBe(true);
    if (!scoped.ok) return;
    expect(scoped.value.domains).toContain(StackDomain.FRONTEND);
    expect(scoped.value.packages).toEqual([]);

    const job = await ws.startUtilityJob({ kind: UTILITY_JOB_ECHO });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    expect(job.value.packageId).toBe("@prism-fixture/m013-web");

    await ws.selectPackage(null);
    const rollup = await ws.getStackProfile();
    expect(rollup.ok).toBe(true);
    if (!rollup.ok) return;
    expect((rollup.value.packages ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
