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
    expect(byName.greet?.kind).toBe("function");
    expect(byName.Greeter?.kind).toBe("class");
    expect(byName.Person?.kind).toBe("interface");
    expect(byName.Id?.kind).toBe("type");
    expect(byName.Role?.kind).toBe("enum");
    expect(byName.local?.kind).toBe("variable");
    expect(byName.local?.exported).toBeFalsy();
    expect(byName.internal?.kind).toBe("function");
    expect(byName.App?.kind).toBe("default");
    expect(byName.localAlias?.kind).toBe("export");

    expect(imports.map((i) => i.source).toSorted()).toEqual([
      "./default-mod.js",
      "./helper.js",
    ]);
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
