import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAnalyzerHost } from "./host.js";
import { createTypescriptPlugin } from "./typescript-plugin.js";

const multiDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "multi",
);

describe("typescript plugin multi-file fixture", () => {
  it("analyzes a↔b import/export edges", async () => {
    const host = createAnalyzerHost({ plugins: [createTypescriptPlugin()] });
    const a = await host.analyzeFile(join(multiDir, "a.ts"));
    const b = await host.analyzeFile(join(multiDir, "b.ts"));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.value.imports).toEqual([
      expect.objectContaining({
        source: "./b.js",
        specifiers: ["b"],
      }),
    ]);
    expect(a.value.exports.some((e) => e.name === "a")).toBe(true);
    expect(a.value.references.some((r) => r.name === "b")).toBe(true);

    expect(b.value.exports.some((e) => e.name === "b")).toBe(true);
    expect(b.value.imports).toEqual([]);
  });
});
