import { describe, expect, it } from "vitest";
import { computeEntryPoints, isOrphanEligibleSource } from "./entry-points.js";

function run(files: Record<string, string>, analyzed: string[]) {
  return computeEntryPoints({
    workspaceRoot: "/nonexistent",
    inventoryPaths: Object.keys(files),
    analyzedPaths: analyzed,
    readText: (rel) => files[rel] ?? null,
  });
}

describe("computeEntryPoints (plan §4.4)", () => {
  it("ENTRY-1 package main/bin/exports, remapped from build output", () => {
    const files = {
      "package.json": JSON.stringify({
        main: "./dist/index.js",
        bin: { tool: "./dist/cli.js" },
        exports: {
          ".": "./dist/index.js",
          "./extra": { import: "./dist/extra.js" },
        },
      }),
      "src/index.ts": "",
      "src/cli.ts": "",
      "src/extra.ts": "",
      "src/lonely.ts": "",
    };
    const { roles } = run(files, [
      "src/index.ts",
      "src/cli.ts",
      "src/extra.ts",
      "src/lonely.ts",
    ]);
    expect(Object.fromEntries(roles)).toEqual({
      "src/index.ts": "package-main",
      "src/cli.ts": "package-bin",
      "src/extra.ts": "package-export",
    });
  });

  it("ENTRY-2 Next routes only in a package that depends on next", () => {
    const files = {
      "package.json": JSON.stringify({ name: "root" }),
      "web/package.json": JSON.stringify({ dependencies: { next: "15" } }),
      "web/src/app/dashboard/page.tsx": "",
      "web/src/pages/api/hello.ts": "",
      "web/src/middleware.ts": "",
      "lib/pages/thing.ts": "",
    };
    const { roles } = run(
      files,
      Object.keys(files).filter((f) => f.endsWith("ts") || f.endsWith("tsx")),
    );
    expect(roles.get("web/src/app/dashboard/page.tsx")).toBe("route");
    expect(roles.get("web/src/pages/api/hello.ts")).toBe("route");
    expect(roles.get("web/src/middleware.ts")).toBe("route");
    expect(roles.has("lib/pages/thing.ts")).toBe(false);
  });

  it("ENTRY-3 literal path string marks public/sw.js; tests are entries", () => {
    const files = {
      "package.json": "{}",
      "public/sw.js": "",
      "public/unused.js": "",
      "src/register.ts": 'navigator.serviceWorker.register("/sw.js");',
      "src/a.test.ts": "",
    };
    const { roles } = run(files, [
      "public/sw.js",
      "public/unused.js",
      "src/register.ts",
      "src/a.test.ts",
    ]);
    expect(roles.get("public/sw.js")).toBe("literal-path");
    expect(roles.has("public/unused.js")).toBe(false);
    expect(roles.get("src/a.test.ts")).toBe("test");
  });

  it("ENTRY-4 an unparseable manifest is reported, not hidden", () => {
    const { manifestErrors } = run({ "package.json": "{oops" }, []);
    expect(manifestErrors.map((e) => e.path)).toEqual(["package.json"]);
  });
});

describe("isOrphanEligibleSource", () => {
  it.each([
    ["src/a.ts", true],
    ["src/a.d.ts", false],
    ["vite.config.ts", false],
    ["vendor/sdk.js", false],
    ["src/generated/client.ts", false],
    ["pkg:react", false],
    ["README.md", false],
    ["pnpm-lock.yaml", false],
  ] as const)("%s → %s", (path, expected) => {
    expect(isOrphanEligibleSource(path)).toBe(expected);
  });
});
