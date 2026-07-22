import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CodeExplorerReportSchema, PrismErrorCode } from "@prism/shared";
import { Prism } from "./prism.js";

const refsFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m011-refs",
);

describe("workspace exploreCode (M-023)", () => {
  it("requires index first", async () => {
    const client = Prism.create();
    const opened = client.openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const blocked = await opened.value.exploreCode({
      kind: "file",
      path: "helper.ts",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe(PrismErrorCode.INDEX_REQUIRED);
  });

  it("returns usages for add and related test for main.ts", async () => {
    const client = Prism.create();
    const opened = client.openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);

    const symbolReport = await ws.exploreCode({
      kind: "symbol",
      name: "add",
      path: "helper.ts",
    });
    expect(symbolReport.ok).toBe(true);
    if (!symbolReport.ok) return;
    expect(CodeExplorerReportSchema.safeParse(symbolReport.value).success).toBe(
      true,
    );
    expect(
      symbolReport.value.usages.some(
        (u) => u.path === "main.ts" && u.kind === "call",
      ),
    ).toBe(true);

    const fileReport = await ws.exploreCode({
      kind: "file",
      path: "main.ts",
    });
    expect(fileReport.ok).toBe(true);
    if (!fileReport.ok) return;
    expect(
      fileReport.value.related.tests.some((t) => t.path === "main.test.ts"),
    ).toBe(true);
  });
});
