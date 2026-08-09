import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTsconfigPathAliases, resolveAliasSpecifier } from "./aliases.js";

describe("loadTsconfigPathAliases — extends + baseUrl (P-E6)", () => {
  it("follows extends and resolves paths relative to baseUrl", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-m059-alias-"));
    writeFileSync(
      join(root, "tsconfig.base.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@lib/*": ["packages/lib/src/*"] },
        },
      }),
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({ extends: "./tsconfig.base.json" }),
    );
    mkdirSync(join(root, "packages/lib/src"), { recursive: true });
    mkdirSync(join(root, "packages/app/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/lib/src/helper.ts"),
      "export const x = 1;",
    );
    writeFileSync(
      join(root, "packages/app/src/main.ts"),
      'import { x } from "@lib/helper";',
    );

    // Intentionally omit tsconfig from indexed paths — unindexed root read.
    const aliases = loadTsconfigPathAliases(root, [
      "packages/lib/src/helper.ts",
      "packages/app/src/main.ts",
    ]);
    expect(aliases.rules.some((r) => r.prefix === "@lib/")).toBe(true);

    const indexed = new Set([
      "packages/lib/src/helper.ts",
      "packages/app/src/main.ts",
    ]);
    expect(
      resolveAliasSpecifier(
        "packages/app/src/main.ts",
        "@lib/helper",
        indexed,
        aliases,
      ),
    ).toBe("packages/lib/src/helper.ts");
  });
});
