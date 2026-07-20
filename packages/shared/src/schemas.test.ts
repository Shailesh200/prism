import { describe, expect, it } from "vitest";
import {
  BlastRadiusReportSchema,
  DnaReportSchema,
  FileInventorySchema,
  HealthScoreSchema,
  IndexSummarySchema,
  PrismErrorSchema,
  parseDto,
} from "./schemas.js";
import { PrismErrorCode } from "./errors.js";

describe("DTO schemas round-trip", () => {
  it("PrismErrorSchema", () => {
    const raw = {
      code: PrismErrorCode.VALIDATION,
      message: "bad input",
      details: { field: "path" },
    };
    const parsed = PrismErrorSchema.parse(raw);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(raw);
  });

  it("IndexSummarySchema", () => {
    const raw = {
      repoId: "repo:demo",
      rootPath: "/tmp/demo",
      indexedAt: "2026-07-20T12:00:00.000Z",
      stats: {
        filesTotal: 10,
        filesIndexed: 9,
        filesSkipped: 1,
        durationMs: 120,
      },
      warnings: ["skipped binary"],
    };
    const parsed = IndexSummarySchema.parse(raw);
    expect(
      parseDto(IndexSummarySchema, JSON.parse(JSON.stringify(parsed))).ok,
    ).toBe(true);
  });

  it("HealthScoreSchema", () => {
    const raw = {
      score: 82,
      grade: "B",
      factors: [{ id: "coupling", label: "Coupling", score: 70, note: "ok" }],
    };
    expect(HealthScoreSchema.parse(raw).grade).toBe("B");
  });

  it("BlastRadiusReportSchema", () => {
    const raw = {
      origin: { kind: "symbol", id: "sym:charge", path: "src/pay.ts" },
      risk: 72,
      affectedFiles: [{ path: "src/api.ts", reason: "imports", depth: 1 }],
      testsLikelyAffected: ["src/pay.test.ts"],
    };
    const parsed = BlastRadiusReportSchema.parse(raw);
    expect(parsed.affectedFiles).toHaveLength(1);
    expect(parseDto(BlastRadiusReportSchema, { bad: true }).ok).toBe(false);
  });

  it("DnaReportSchema", () => {
    const raw = {
      languages: [{ id: "typescript", share: 0.8 }],
      frameworks: ["react"],
      packageManager: "bun",
      summary: "TS monorepo",
    };
    expect(DnaReportSchema.parse(raw).frameworks).toContain("react");
  });

  it("FileInventorySchema", () => {
    const raw = {
      rootPath: "/tmp/demo",
      hashAlgo: "sha256",
      generatedAt: "2026-07-20T12:00:00.000Z",
      files: [
        {
          path: "src/a.ts",
          sizeBytes: 12,
          mtimeMs: 1,
          hashAlgo: "sha256",
          contentHash: "abc",
          status: "hashed",
        },
      ],
      stats: {
        filesSeen: 1,
        filesHashed: 1,
        filesSkipped: 0,
        filesIgnored: 0,
        durationMs: 5,
      },
    };
    expect(FileInventorySchema.parse(raw).files[0]?.path).toBe("src/a.ts");
  });
});
