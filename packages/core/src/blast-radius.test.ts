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
});
