import { describe, expect, it } from "vitest";
import {
  BlastRadiusReportSchema,
  DnaReportSchema,
  FileInventorySchema,
  StackProfileSchema,
  HealthHistoryReportSchema,
  HealthScoreSchema,
  GraphSnapshotDtoSchema,
  IndexSnapshotSchema,
  IndexSummarySchema,
  IntelligenceReportSchema,
  PrismErrorSchema,
  RegionMoversReportSchema,
  TestingReportSchema,
  SecurityReportSchema,
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

  it("GraphSnapshotDtoSchema", () => {
    const raw = {
      id: "g1",
      nodes: [{ id: "a", kind: "file", label: "a.ts" }],
      edges: [{ id: "e1", kind: "imports", from: "a", to: "a" }],
    };
    expect(GraphSnapshotDtoSchema.parse(raw).nodes[0]?.id).toBe("a");
  });

  it("IndexSnapshotSchema", () => {
    const raw = {
      repoId: "repo:demo",
      rootPath: "/tmp/demo",
      indexedAt: "2026-07-20T12:00:00.000Z",
      files: [
        {
          path: "src/a.ts",
          pluginId: "typescript",
          contentHash: "abc",
          status: "analyzed",
          symbols: [{ name: "a", kind: "function", start: 0, end: 1 }],
          imports: [{ source: "./b.js", specifiers: ["b"] }],
          exports: [{ name: "a", kind: "name" }],
          references: [{ name: "b", kind: "call", start: 2, end: 3 }],
          diagnostics: [],
        },
      ],
      stats: {
        filesTotal: 1,
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 5,
      },
      warnings: [],
    };
    expect(IndexSnapshotSchema.parse(raw).files[0]?.path).toBe("src/a.ts");
  });

  it("HealthScoreSchema", () => {
    const raw = {
      score: 82,
      grade: "B",
      factors: [
        {
          id: "coupling",
          label: "TS/JS import coupling",
          score: 70,
          note: "ok",
          breakdown: [
            { label: "Graph nodes", value: 4 },
            { label: "Cycles", value: 1 },
          ],
        },
      ],
      graphCoveragePct: 40,
    };
    const parsed = HealthScoreSchema.parse(raw);
    expect(parsed.grade).toBe("B");
    expect(parsed.graphCoveragePct).toBe(40);
    expect(parsed.factors[0]?.breakdown?.[0]?.label).toBe("Graph nodes");
  });

  it("HealthHistoryReportSchema + RegionMoversReportSchema", () => {
    const history = HealthHistoryReportSchema.parse({
      points: [
        {
          at: "2026-01-01T00:00:00.000Z",
          commitSha: "abc123",
          score: 70,
          factors: [{ id: "coupling", score: 65 }],
        },
      ],
    });
    expect(history.points[0]?.commitSha).toBe("abc123");

    const movers = RegionMoversReportSchema.parse({
      improving: [
        {
          id: "feat:a",
          label: "A",
          fromScore: 40,
          toScore: 70,
          delta: 30,
        },
      ],
      regressing: [
        {
          id: "feat:b",
          label: "B",
          fromScore: 80,
          toScore: 50,
          delta: -30,
        },
      ],
    });
    expect(movers.improving[0]?.delta).toBe(30);
    expect(movers.regressing[0]?.delta).toBe(-30);
  });

  it("BlastRadiusReportSchema", () => {
    const raw = {
      origin: { kind: "symbol", id: "sym:charge", path: "src/pay.ts" },
      risk: 72,
      affectedFiles: [{ path: "src/api.ts", reason: "imports", depth: 1 }],
      testsLikelyAffected: ["src/pay.test.ts"],
      coverageLimitations: ["Dependency-injection container bindings"],
      forwardDependenciesTotalCount: 90,
      forwardDependenciesTruncated: true,
    };
    const parsed = BlastRadiusReportSchema.parse(raw);
    expect(parsed.affectedFiles).toHaveLength(1);
    expect(parsed.coverageLimitations).toHaveLength(1);
    expect(parsed.forwardDependenciesTruncated).toBe(true);
    expect(parseDto(BlastRadiusReportSchema, { bad: true }).ok).toBe(false);
  });

  it("DnaReportSchema", () => {
    const raw = {
      languages: [{ id: "typescript", share: 0.8 }],
      frameworks: ["react"],
      packageManager: "bun",
      summary: "TS monorepo",
      architectureHints: ["monorepo"],
      testRunners: ["vitest"],
      rankedDomains: [
        { id: "frontend", confidence: 0.95 },
        { id: "backend", confidence: 0.8 },
      ],
      primaryDomain: "frontend",
    };
    const parsed = DnaReportSchema.parse(raw);
    expect(parsed.frameworks).toContain("react");
    expect(parsed.architectureHints).toContain("monorepo");
    expect(parsed.testRunners).toContain("vitest");
    expect(parsed.primaryDomain).toBe("frontend");
    expect(parsed.rankedDomains[0]?.id).toBe("frontend");
  });

  it("IntelligenceReportSchema", () => {
    const raw = {
      repoId: "repo:x",
      rootPath: "/tmp/x",
      generatedAt: "2026-07-20T12:00:00.000Z",
      summary: {
        repoId: "repo:x",
        rootPath: "/tmp/x",
        indexedAt: "2026-07-20T12:00:00.000Z",
        stats: {
          filesTotal: 1,
          filesIndexed: 1,
          filesSkipped: 0,
          durationMs: 1,
        },
        warnings: [],
      },
      dna: {
        languages: [],
        frameworks: [],
        summary: "Partial DNA: no stack signals detected",
        architectureHints: [],
        testRunners: [],
      },
      dependencyGraph: { id: "deps", nodes: [], edges: [] },
      knowledgeGraph: { id: "kg", nodes: [], edges: [] },
      knowledgeStats: {
        nodes: 0,
        edges: 0,
        nodesByKind: {},
        edgesByKind: {},
      },
      featureGraph: { id: "fg", nodes: [], edges: [] },
      features: [],
      consistency: { ok: true, issues: [] },
      capabilities: {
        indexing: true,
        analysis: true,
        graphs: true,
        intelligence: true,
        impact: false,
        map: false,
        navigation: false,
      },
    };
    expect(IntelligenceReportSchema.parse(raw).consistency.ok).toBe(true);
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

  it("StackProfileSchema", () => {
    const raw = {
      rootPath: "/tmp/demo",
      generatedAt: "2026-07-20T12:00:00.000Z",
      signals: [
        {
          id: "nodejs-manifest",
          domain: "tooling",
          confidence: 0.5,
          personas: [],
          evidence: ["package.json"],
        },
      ],
      domains: ["tooling"],
      personas: [],
      summary: "Node manifest detected",
    };
    const parsed = StackProfileSchema.parse(raw);
    expect(parsed.domains).toContain("tooling");
    expect(parsed.packages).toEqual([]);
  });

  it("TestingReportSchema", () => {
    const raw = {
      score: 72,
      runners: ["vitest"],
      suites: [
        { kind: "unit", path: "src", fileCount: 12 },
        { kind: "e2e", path: "e2e", fileCount: 3 },
      ],
      coverage: { present: true, linePct: 81.5, source: "coverage/lcov.info" },
      summary: "Vitest with unit + e2e suites; coverage present",
    };
    const parsed = TestingReportSchema.parse(raw);
    expect(parsed.runners).toContain("vitest");
    expect(parsed.suites).toHaveLength(2);
    expect(parsed.coverage?.linePct).toBe(81.5);
  });

  it("SecurityReportSchema", () => {
    const raw = {
      score: 64,
      tools: [
        {
          id: "dependabot",
          name: "Dependabot",
          present: true,
          path: ".github/dependabot.yml",
        },
        { id: "snyk", name: "Snyk", present: false },
      ],
      checks: [
        {
          id: "no_env_committed",
          status: "pass",
          title: "No committed .env secrets file",
        },
        {
          id: "lockfile_present",
          status: "pass",
          title: "Dependency lockfile present",
          detail: "bun.lock",
        },
      ],
      summary: "Dependabot present; 2/2 checks passed",
    };
    const parsed = SecurityReportSchema.parse(raw);
    expect(parsed.tools.filter((t) => t.present)).toHaveLength(1);
    expect(parsed.checks[0]?.status).toBe("pass");
  });
});
