import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BlastRadiusReportSchema, PrismErrorCode } from "@prism/shared";
import { describe, expect, it } from "vitest";
import { Prism } from "./prism.js";

const here = dirname(fileURLToPath(import.meta.url));
const refsFixture = join(
  here,
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m011-refs",
);

function readGolden(name: string): unknown {
  return JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"));
}

describe("workspace blast radius (M-020)", () => {
  it("advertises the impact capability", () => {
    expect(Prism.create().capabilities.impact).toBe(true);
  });

  it("requires an index before blastRadius", async () => {
    const opened = Prism.create().openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const res = await opened.value.blastRadius({
      kind: "file",
      id: "helper.ts",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe(PrismErrorCode.INDEX_REQUIRED);
  });

  it("matches the golden report for a file change", async () => {
    const opened = Prism.create().openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const res = await ws.blastRadius({ kind: "file", id: "helper.ts" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(BlastRadiusReportSchema.safeParse(res.value).success).toBe(true);
    expect(res.value).toEqual(readGolden("blast-radius-helper.golden.json"));
  });

  it("matches the golden report for a symbol change", async () => {
    const opened = Prism.create().openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const res = await ws.blastRadius({
      kind: "symbol",
      id: "add",
      path: "helper.ts",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(BlastRadiusReportSchema.safeParse(res.value).success).toBe(true);
    expect(res.value).toEqual(readGolden("blast-radius-add.golden.json"));
  });

  it("errors for an unknown file target", async () => {
    const opened = Prism.create().openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const res = await ws.blastRadius({ kind: "file", id: "ghost.ts" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe(PrismErrorCode.NOT_FOUND);
  });

  it("soft-lanes vitest.config: Mid/High risk, tests matched, not safe to delete", async () => {
    const fixture = join(
      here,
      "..",
      "..",
      "intelligence",
      "fixtures",
      "m049-vitest",
    );
    const opened = Prism.create().openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const blast = await ws.blastRadius({
      kind: "file",
      id: "vitest.config.ts",
    });
    expect(blast.ok).toBe(true);
    if (!blast.ok) return;
    expect(blast.value.risk).toBeGreaterThanOrEqual(45);
    expect(blast.value.softAffectedCount ?? 0).toBeGreaterThan(0);
    expect(blast.value.testsLikelyAffected).toContain("src/util.test.ts");
    expect(
      blast.value.lanes?.some((l) => l.id === "test" || l.id === "config"),
    ).toBe(true);

    const del = await ws.safeDelete({ kind: "file", id: "vitest.config.ts" });
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.value.safe).toBe(false);
    expect(del.value.toolingCritical).toBe(true);
  });

  it("barrel index.ts via package name lists app.ts as hard dependent", async () => {
    const fixture = join(
      here,
      "..",
      "..",
      "intelligence",
      "fixtures",
      "m049-barrel",
    );
    const opened = Prism.create().openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const blast = await ws.blastRadius({
      kind: "file",
      id: "packages/foo/src/index.ts",
    });
    expect(blast.ok).toBe(true);
    if (!blast.ok) return;
    const paths = blast.value.affectedFiles.map((f) => f.path);
    expect(paths).toContain("apps/web/src/app.ts");
    expect(blast.value.risk).toBeGreaterThan(15);
    const app = blast.value.affectedFiles.find(
      (f) => f.path === "apps/web/src/app.ts",
    );
    expect(app?.category ?? "import").toBe("import");
    expect(app?.evidence?.some((e) => e.includes("@fixture/foo"))).toBe(true);

    const del = await ws.safeDelete({
      kind: "file",
      id: "packages/foo/src/index.ts",
    });
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.value.safe).toBe(false);
    expect(
      del.value.blockers.some((b) => b.path === "apps/web/src/app.ts"),
    ).toBe(true);

    // Leaf re-export: reverse through barrel still reaches the package consumer
    const leaf = await ws.blastRadius({
      kind: "file",
      id: "packages/foo/src/bar.ts",
    });
    expect(leaf.ok).toBe(true);
    if (!leaf.ok) return;
    const leafPaths = leaf.value.affectedFiles.map((f) => f.path);
    expect(leafPaths).toContain("packages/foo/src/index.ts");
    expect(leafPaths).toContain("apps/web/src/app.ts");
  });
});
