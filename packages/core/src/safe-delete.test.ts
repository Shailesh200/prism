import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PrismErrorCode,
  RenameImpactReportSchema,
  SafeDeleteReportSchema,
  TestImpactReportSchema,
} from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { Prism, type PrismWorkspace } from "./index.js";

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

/**
 * A throwaway copy. The fixture lives inside this repository, and opening it
 * in place makes `testImpact` read the repository's own git history.
 */
function fixtureCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "prism-m011-"));
  cpSync(refsFixture, dir, { recursive: true });
  return dir;
}

async function openIndexed(): Promise<PrismWorkspace | null> {
  const opened = Prism.create().openRepository(fixtureCopy());
  if (!opened.ok) return null;
  const indexed = await opened.value.index();
  if (!indexed.ok) return null;
  return opened.value;
}

describe("workspace change-safety APIs (M-021)", () => {
  it("requires an index first", async () => {
    const opened = Prism.create().openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const res = await opened.value.safeDelete({ kind: "file", id: "main.ts" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe(PrismErrorCode.INDEX_REQUIRED);
  });

  it("safeDelete matches the golden report (blockers + orphans)", async () => {
    const ws = await openIndexed();
    expect(ws).not.toBeNull();
    if (!ws) return;
    const res = await ws.safeDelete({ kind: "file", id: "main.ts" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(SafeDeleteReportSchema.safeParse(res.value).success).toBe(true);
    expect(res.value).toEqual(readGolden("safe-delete-main.golden.json"));
  });

  it("safeDelete reports a leaf symbol's referencing blockers", async () => {
    const ws = await openIndexed();
    if (!ws) return;
    const res = await ws.safeDelete({
      kind: "symbol",
      id: "Base",
      path: "helper.ts",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.safe).toBe(false);
    expect(res.value.blockers.some((b) => b.path === "main.ts")).toBe(true);
  });

  it("renameImpact matches the golden report (edit sites + breaking hints)", async () => {
    const ws = await openIndexed();
    if (!ws) return;
    const res = await ws.renameImpact({
      kind: "symbol",
      id: "Base",
      path: "helper.ts",
      newName: "Root",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(RenameImpactReportSchema.safeParse(res.value).success).toBe(true);
    expect(res.value).toEqual(readGolden("rename-base.golden.json"));
  });

  it("testImpact matches the golden report", async () => {
    const ws = await openIndexed();
    if (!ws) return;
    const res = await ws.testImpact({ kind: "file", id: "helper.ts" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(TestImpactReportSchema.safeParse(res.value).success).toBe(true);
    expect(res.value).toEqual(readGolden("test-impact-helper.golden.json"));
  });

  it("errors for an unknown symbol", async () => {
    const ws = await openIndexed();
    if (!ws) return;
    const res = await ws.renameImpact({ kind: "symbol", id: "nope" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe(PrismErrorCode.NOT_FOUND);
  });
});
