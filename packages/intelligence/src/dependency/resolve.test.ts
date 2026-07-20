import { describe, expect, it } from "vitest";
import {
  barePackageName,
  isBarePackageSpecifier,
  isRelativeSpecifier,
  resolveImportTarget,
  resolveRelativePath,
} from "./resolve.js";

describe("resolveRelativePath", () => {
  it("joins and collapses ..", () => {
    expect(resolveRelativePath("src/a.ts", "./b.ts")).toBe("src/b.ts");
    expect(resolveRelativePath("src/nested/a.ts", "../b.ts")).toBe("src/b.ts");
    expect(resolveRelativePath("src/a.ts", "../../out.ts")).toBe(null);
  });
});

describe("resolveImportTarget", () => {
  it("remaps .js specifier to .ts when indexed", () => {
    const indexed = new Set(["src/b.ts"]);
    expect(resolveImportTarget("src/a.ts", "./b.js", indexed)).toBe("src/b.ts");
  });

  it("resolves index.ts", () => {
    const indexed = new Set(["src/lib/index.ts"]);
    expect(resolveImportTarget("src/a.ts", "./lib", indexed)).toBe(
      "src/lib/index.ts",
    );
  });
});

describe("specifiers", () => {
  it("classifies relative vs bare", () => {
    expect(isRelativeSpecifier("./x")).toBe(true);
    expect(isBarePackageSpecifier("lodash")).toBe(true);
    expect(isBarePackageSpecifier("@scope/pkg/sub")).toBe(true);
    expect(barePackageName("@scope/pkg/sub")).toBe("@scope/pkg");
    expect(barePackageName("lodash/fp")).toBe("lodash");
  });
});
