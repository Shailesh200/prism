import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAnalyzerHost } from "./host.js";
import {
  createTypescriptPlugin,
  TYPESCRIPT_PLUGIN_ID,
} from "./typescript-plugin.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

describe("createTypescriptPlugin", () => {
  it("detects TS/JS extensions only", () => {
    const plugin = createTypescriptPlugin();
    expect(plugin.id).toBe(TYPESCRIPT_PLUGIN_ID);
    expect(plugin.detect({ path: "a.ts" })).toBe(true);
    expect(plugin.detect({ path: "a.tsx" })).toBe(true);
    expect(plugin.detect({ path: "a.js" })).toBe(true);
    expect(plugin.detect({ path: "a.noop" })).toBe(false);
  });

  it("extracts golden symbols and imports from sample.ts", async () => {
    const path = join(fixturesDir, "sample.ts");
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { symbols, imports, exports, references, diagnostics } = result.value;
    expect(diagnostics).toEqual([]);

    const byName = Object.fromEntries(symbols.map((s) => [s.name, s]));
    expect(byName.answer?.kind).toBe("variable");
    expect(byName.answer?.exported).toBe(true);
    // sample.ts has both `function greet` and `Greeter.greet` method
    expect(
      symbols.some((s) => s.name === "greet" && s.kind === "function"),
    ).toBe(true);
    expect(symbols.some((s) => s.name === "greet" && s.kind === "method")).toBe(
      true,
    );
    expect(byName.Greeter?.kind).toBe("class");
    expect(byName.Person?.kind).toBe("interface");
    expect(byName.Id?.kind).toBe("type");
    expect(byName.Role?.kind).toBe("enum");
    expect(byName.local?.kind).toBe("variable");
    expect(byName.local?.exported).toBeFalsy();
    expect(byName.internal?.kind).toBe("function");
    expect(byName.App?.kind).toBe("default");
    expect(byName.localAlias?.kind).toBe("export");

    expect(imports.map((i) => i.source)).toEqual(
      expect.arrayContaining(["./default-mod.js", "./helper.js"]),
    );
    expect(imports).toHaveLength(2);
    const helperImport = imports.find((i) => i.source === "./helper.js");
    expect(helperImport?.specifiers).toEqual(
      expect.arrayContaining(["helper", "HelperType"]),
    );

    expect(exports.map((e) => e.name)).toEqual(
      expect.arrayContaining([
        "answer",
        "greet",
        "Greeter",
        "Person",
        "Id",
        "Role",
        "localAlias",
        "default",
      ]),
    );

    expect(
      references.some((r) => r.name === "helper" && r.kind === "call"),
    ).toBe(true);
    expect(references.some((r) => r.name === "def" && r.kind === "call")).toBe(
      true,
    );
  });

  it("extracts extends and implements heritage as references", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-heritage-"));
    const path = join(dir, "heritage.ts");
    await writeFile(
      path,
      [
        "export class Base {}",
        "export interface IFace {}",
        "export class Child extends Base implements IFace {}",
      ].join("\n"),
      "utf8",
    );
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.references.some(
        (r) => r.name === "Base" && r.kind === "extends",
      ),
    ).toBe(true);
    expect(
      result.value.references.some(
        (r) => r.name === "IFace" && r.kind === "implements",
      ),
    ).toBe(true);
  });

  it("parses TSX fixtures", async () => {
    const path = join(fixturesDir, "sample.tsx");
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diagnostics).toEqual([]);
    expect(result.value.symbols.map((s) => s.name)).toEqual(
      expect.arrayContaining(["Badge", "Page"]),
    );
    expect(result.value.imports[0]?.source).toBe("react");
  });

  it("extracts static-string dynamic import()", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-dynimp-"));
    const path = join(dir, "loader.ts");
    await writeFile(
      path,
      'export async function load() {\n  return import("./mod.ts");\n}\n',
      "utf8",
    );
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.imports.map((i) => i.source)).toContain("./mod.ts");
  });

  it("marks type-only imports and re-exports (plan §4.1)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-typeonly-"));
    const path = join(dir, "mix.ts");
    await writeFile(
      path,
      [
        'import type { A } from "./a";',
        'import { type B, c } from "./b";',
        'import { type D } from "./d";',
        'import "./e";',
        'export type { X } from "./x";',
        'export { y } from "./y";',
      ].join("\n"),
      "utf8",
    );
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const typeOnly = Object.fromEntries(
      result.value.imports.map((i) => [i.source, i.typeOnly === true]),
    );
    expect(typeOnly).toEqual({
      "./a": true,
      "./b": false,
      "./d": true,
      "./e": false,
    });
    const reexports = Object.fromEntries(
      result.value.exports
        .filter((e) => e.source)
        .map((e) => [e.source, e.typeOnly === true]),
    );
    expect(reexports).toEqual({ "./x": true, "./y": false });
  });

  it("narrows namespace imports to the members read (NS-1)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-ns-"));
    const path = join(dir, "ns.ts");
    await writeFile(
      path,
      [
        'import * as lo from "./lo";',
        'import * as esc from "./esc";',
        'import * as ty from "./ty";',
        "lo.debounce(1);",
        'lo["nth"](2);',
        "use(esc);",
        "let t: ty.Opts;",
      ].join("\n"),
      "utf8",
    );
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported = Object.fromEntries(
      result.value.imports.map((i) => [i.source, i.imported]),
    );
    expect(imported).toEqual({
      "./lo": ["debounce", "nth"],
      "./esc": ["*"],
      "./ty": ["Opts"],
    });
  });

  it("NS-2 computed non-literal key falls back to all members", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-ns2-"));
    const path = join(dir, "ns2.ts");
    await writeFile(
      path,
      [
        'import * as lo from "./lo";',
        'const k = cond ? "a" : "b";',
        "lo[k](1);",
      ].join("\n"),
      "utf8",
    );
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.value.imports.find((i) => i.source === "./lo");
    expect(row?.imported).toEqual(["*"]);
  });

  it("NS-3 escaping the namespace as a value falls back to all members", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-ns3-"));
    const path = join(dir, "ns3.ts");
    await writeFile(
      path,
      [
        'import * as lo from "./lo";',
        "export const all = lo;",
        "passThrough(lo);",
        "const copy = { ...lo };",
      ].join("\n"),
      "utf8",
    );
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.value.imports.find((i) => i.source === "./lo");
    expect(row?.imported).toEqual(["*"]);
  });

  it("extracts MemberExpression / optional call refs with via:member (P-A4)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-member-"));
    const path = join(dir, "svc.ts");
    await writeFile(
      path,
      [
        "export class Greeter {",
        "  greet() { return 1; }",
        "  run() { return 2; }",
        "}",
        "export function callAll(g: Greeter) {",
        "  g.greet();",
        "  g?.greet();",
        "  return g.run();",
        "}",
      ].join("\n"),
      "utf8",
    );
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.symbols.some(
        (s) => s.name === "greet" && s.kind === "method",
      ),
    ).toBe(true);
    const memberCalls = result.value.references.filter(
      (r) => r.kind === "call" && r.via === "member",
    );
    expect(memberCalls.map((r) => r.name).sort()).toEqual([
      "greet",
      "greet",
      "run",
    ]);
  });

  it("extracts static require() and createRequire()(…) (P-E4)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-cjs-"));
    const path = join(dir, "main.js");
    await writeFile(
      path,
      [
        'const { createRequire } = require("module");',
        'const util = require("./util.js");',
        'const again = createRequire(__filename)("./util.js");',
        "module.exports = { util, again };",
      ].join("\n"),
      "utf8",
    );
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const requires = result.value.imports.filter((i) => i.kind === "require");
    expect(requires.map((i) => i.source).sort()).toEqual([
      "./util.js",
      "./util.js",
      "module",
    ]);
  });

  it("returns file-level diagnostics without failing analyze", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-broken-"));
    const path = join(dir, "broken.ts");
    // Intentionally invalid — kept out of fixtures/ so format hooks skip it.
    await writeFile(path, "function ( {\n", "utf8");

    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diagnostics.length).toBeGreaterThan(0);
    expect(result.value.diagnostics[0]?.severity).toBe("error");
  });
});
