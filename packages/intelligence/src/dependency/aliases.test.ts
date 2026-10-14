import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTsconfigPathAliases,
  pickConditionalTarget,
  resolveAliasSpecifier,
} from "./aliases.js";
import { parseJsonc } from "./soft-impact-utils.js";

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

describe("resolver contract (plan §4.1, RES-1…5)", () => {
  function repo(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "prism-res-"));
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), body);
    }
    return root;
  }

  it("RES-1 reads JSONC tsconfig whose strings contain `/*` (rentmaadi `@/*`)", () => {
    const root = repo({
      "apps/web/tsconfig.json": `{
        // app config
        "compilerOptions": {
          "baseUrl": ".",
          "paths": { "@/*": ["./src/*"] }, /* trailing comma next */
        },
      }`,
      "apps/web/src/lib/dateUtils.ts": "export const d = 1;",
      "apps/web/src/pages/Page.tsx": 'import { d } from "@/lib/dateUtils";',
    });
    const files = [
      "apps/web/src/lib/dateUtils.ts",
      "apps/web/src/pages/Page.tsx",
    ];
    const aliases = loadTsconfigPathAliases(root, files);
    expect(aliases.errors).toBeUndefined();
    expect(
      resolveAliasSpecifier(
        files[1]!,
        "@/lib/dateUtils",
        new Set(files),
        aliases,
      ),
    ).toBe("apps/web/src/lib/dateUtils.ts");
  });

  it("RES-2 follows `extends` into an uninstalled workspace config package", () => {
    const root = repo({
      "packages/config/package.json": JSON.stringify({ name: "@acme/config" }),
      "packages/config/tsconfig.vite.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "~/*": ["./shared/*"] } },
      }),
      "packages/config/shared/x.ts": "export const x = 1;",
      "apps/web/tsconfig.json": JSON.stringify({
        extends: "@acme/config/tsconfig.vite.json",
      }),
      "apps/web/src/main.ts": 'import { x } from "~/x";',
    });
    const files = [
      "packages/config/package.json",
      "packages/config/shared/x.ts",
      "apps/web/src/main.ts",
    ];
    const aliases = loadTsconfigPathAliases(root, files);
    expect(
      resolveAliasSpecifier(
        "apps/web/src/main.ts",
        "~/x",
        new Set(files),
        aliases,
      ),
    ).toBe("packages/config/shared/x.ts");
  });

  it("RES-3 package `imports` honour conditions types → import → require → default", () => {
    expect(pickConditionalTarget("./a.ts")).toBe("./a.ts");
    expect(
      pickConditionalTarget({ require: "./r.cjs", import: "./i.mjs" }),
    ).toBe("./i.mjs");
    expect(pickConditionalTarget({ node: { default: "./n.js" } })).toBeNull();
    expect(pickConditionalTarget({ default: { import: "./d.mjs" } })).toBe(
      "./d.mjs",
    );
    expect(pickConditionalTarget([null, { default: "./x.js" }])).toBe("./x.js");
  });

  it("RES-4 a broken tsconfig is reported, not silently treated as no aliases", () => {
    const root = repo({ "tsconfig.json": "{ not json", "src/a.ts": "" });
    const aliases = loadTsconfigPathAliases(root, ["src/a.ts"]);
    expect(aliases.errors?.[0]?.path).toBe("tsconfig.json");
  });

  it("RES-5 parseJsonc never edits string contents", () => {
    expect(parseJsonc('{"a": "/* not a comment */", "b": "//x",}')).toEqual({
      a: "/* not a comment */",
      b: "//x",
    });
  });
});

describe("workspace package exports → source (plan §4.1, RES-6)", () => {
  it("RES-6 maps `./dist/x.js` exports back to the tsconfig rootDir source", async () => {
    const { discoverLocalPackages, resolveLocalPackageSpecifier } =
      await import("./packages.js");
    const root = mkdtempSync(join(tmpdir(), "prism-res6-"));
    mkdirSync(join(root, "packages/shared/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/shared/package.json"),
      JSON.stringify({
        name: "@acme/shared",
        exports: {
          ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
          "./lens-store": {
            types: "./dist/lens-store.d.ts",
            import: "./dist/lens-store.js",
          },
        },
      }),
    );
    writeFileSync(
      join(root, "packages/shared/tsconfig.json"),
      '{ "compilerOptions": { "outDir": "dist", "rootDir": "src", }, }',
    );
    const indexed = new Set([
      "packages/shared/src/index.ts",
      "packages/shared/src/lens-store.ts",
    ]);
    const packages = discoverLocalPackages(
      root,
      ["packages/shared/package.json", ...indexed],
      indexed,
    );
    expect(
      resolveLocalPackageSpecifier(
        "@acme/shared/lens-store",
        packages,
        indexed,
      ),
    ).toBe("packages/shared/src/lens-store.ts");
    expect(
      resolveLocalPackageSpecifier("@acme/shared", packages, indexed),
    ).toBe("packages/shared/src/index.ts");
  });
});
