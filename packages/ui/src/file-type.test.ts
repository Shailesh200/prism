import { describe, expect, it } from "vitest";
import { resolveFileType } from "./file-type.js";

describe("resolveFileType", () => {
  it("maps TypeScript and tests", () => {
    expect(resolveFileType("Dashboard.ts")).toMatchObject({
      badge: "TS",
      label: "TypeScript",
      tone: "ts",
    });
    expect(resolveFileType("cart.test.ts")).toMatchObject({
      badge: "TEST",
      tone: "test",
    });
  });

  it("maps package manifests", () => {
    expect(resolveFileType("package.json")).toMatchObject({
      badge: "PKG",
      tone: "config",
    });
  });
});
