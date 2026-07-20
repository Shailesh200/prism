import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAnalyzerHost,
  type LanguagePlugin,
  type ParseResult,
} from "@prism/analyzer";
import { ANALYZER_SPI_VERSION } from "@prism/analyzer";
import { err, ok, prismError, PrismErrorCode } from "@prism/shared";
import { runIndexJob } from "./index-job.js";

function failingPlugin(): LanguagePlugin {
  return {
    id: "failing-ts",
    spiVersion: ANALYZER_SPI_VERSION,
    extensions: [".ts"],
    capabilities: {
      detect: true,
      parse: true,
      extractSymbols: true,
      extractImports: true,
      extractExports: true,
      extractReferences: true,
    },
    detect: () => true,
    async parse() {
      return err(
        prismError(PrismErrorCode.ANALYZER_FAILED, "forced parse failure"),
      );
    },
    extractSymbols: (_p: ParseResult) => ok({ symbols: [] }),
    extractImports: () => ok({ imports: [] }),
    extractExports: () => ok({ exports: [] }),
    extractReferences: () => ok({ references: [] }),
  };
}

describe("runIndexJob soft failures", () => {
  it("records failed files without failing the job", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-m007-fail-"));
    await writeFile(join(root, "package.json"), '{"name":"x"}\n', "utf8");
    await writeFile(join(root, "bad.ts"), "export const x = 1;\n", "utf8");
    await writeFile(join(root, "ok.md"), "skip me\n", "utf8");

    const analyzer = createAnalyzerHost({ plugins: [failingPlugin()] });
    const result = await runIndexJob(root, { analyzer, concurrency: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bad = result.value.files.find((f) => f.path === "bad.ts");
    expect(bad?.status).toBe("failed");
    expect(bad?.error?.code).toBe(PrismErrorCode.ANALYZER_FAILED);
    expect(result.value.warnings.some((w) => w.includes("failed"))).toBe(true);
    expect(result.value.stats.filesTotal).toBeGreaterThan(0);
  });
});
