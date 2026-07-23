import { describe, expect, it } from "vitest";
import { resolveRenameToPath, rewritePathReferences } from "./apply-rename.js";

describe("resolveRenameToPath", () => {
  it("replaces basename when newName has no slash", () => {
    expect(resolveRenameToPath("src/util.ts", "helper.ts")).toBe(
      "src/helper.ts",
    );
  });

  it("accepts a full relative path", () => {
    expect(resolveRenameToPath("src/util.ts", "lib/helper.ts")).toBe(
      "lib/helper.ts",
    );
  });
});

describe("rewritePathReferences", () => {
  it("rewrites full path and stem in imports", () => {
    const src = `import { x } from "./src/util";\nimport "./src/util.ts";\n`;
    const { next, replacements } = rewritePathReferences(
      src,
      "src/util.ts",
      "src/helper.ts",
    );
    expect(replacements).toBeGreaterThan(0);
    expect(next).toContain("./src/helper");
    expect(next).not.toContain("./src/util");
  });
});
