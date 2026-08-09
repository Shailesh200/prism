import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  artifactUri,
  cyclesToSarif,
  parseFormat,
  reviewToSarif,
  SARIF_VERSION,
} from "./sarif.js";

const Ajv =
  (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
const addFormats =
  (addFormatsModule as unknown as { default?: typeof addFormatsModule })
    .default ?? addFormatsModule;

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(
  readFileSync(join(packageDir, "schemas/sarif-2.1.0.json"), "utf8"),
) as object;

function validateSarif(
  log: unknown,
): { ok: true } | { ok: false; errors: string } {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateSchema: false,
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (validate(log)) return { ok: true };
  return {
    ok: false,
    errors: ajv.errorsText(validate.errors, { separator: "\n" }),
  };
}

describe("parseFormat (M-060)", () => {
  it("accepts sarif and rejects unknown formats", () => {
    expect(parseFormat(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseFormat("sarif")).toEqual({ ok: true, value: "sarif" });
    expect(parseFormat("SARIF").ok).toBe(true);
    const bad = parseFormat("yaml");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toContain("sarif");
  });
});

describe("SARIF emitters (M-060)", () => {
  it("maps review items to a schema-valid SARIF 2.1.0 log", () => {
    const log = reviewToSarif({
      generatedAt: "2026-08-08T12:00:00.000Z",
      base: "origin/main",
      overallRisk: 72,
      band: "high",
      totalAffectedFiles: 4,
      totalTestsAffected: 2,
      totalBreakingChanges: 0,
      items: [
        {
          path: "packages/core/src/index.ts",
          risk: 72,
          affectedFilesCount: 4,
          testsLikelyAffected: ["packages/core/src/index.test.ts"],
          breakingChanges: [],
        },
        {
          path: "packages/cli/src/sarif.ts",
          risk: 10,
          affectedFilesCount: 0,
          testsLikelyAffected: [],
          breakingChanges: [],
        },
      ],
    });

    expect(log.version).toBe(SARIF_VERSION);
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0]!.results).toHaveLength(2);
    expect(log.runs[0]!.results[0]!.level).toBe("error");
    expect(log.runs[0]!.results[1]!.level).toBe("note");

    const result = validateSarif(log);
    expect(result).toEqual({ ok: true });
  });

  it("maps import cycles to a schema-valid SARIF 2.1.0 log", () => {
    const log = cyclesToSarif({
      totalCount: 1,
      cycles: [["file:src/a.ts", "file:src/b.ts"]],
    });

    expect(log.runs[0]!.results[0]!.message.text).toContain("src/a.ts");
    expect(
      log.runs[0]!.results[0]!.locations?.[0]?.physicalLocation.artifactLocation
        .uri,
    ).toBe("src/a.ts");

    const result = validateSarif(log);
    expect(result).toEqual({ ok: true });
  });

  it("emits an empty results array when there is nothing to report", () => {
    const review = reviewToSarif({
      generatedAt: "2026-08-08T12:00:00.000Z",
      items: [],
      overallRisk: 0,
      totalAffectedFiles: 0,
      totalTestsAffected: 0,
      totalBreakingChanges: 0,
    });
    const cycles = cyclesToSarif({ cycles: [], totalCount: 0 });
    expect(validateSarif(review)).toEqual({ ok: true });
    expect(validateSarif(cycles)).toEqual({ ok: true });
  });

  it("strips graph id prefixes for artifact URIs", () => {
    expect(artifactUri("file:src/x.ts")).toBe("src/x.ts");
    expect(artifactUri("pkg:@repo-prism/core")).toBe("@repo-prism/core");
    expect(artifactUri("src/x.ts")).toBe("src/x.ts");
  });
});
