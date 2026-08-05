import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  DeveloperPersona,
  DnaReportSchema,
  StackDomain,
  type StackProfile,
} from "@repo-prism/shared";
import { createStackHost } from "../host.js";
import {
  assembleDnaReport,
  primaryDomain,
  rankDomainsByConfidence,
} from "./dna.js";
import { createDefaultDetectorPacks } from "./packs.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
);

async function profileOf(fixtureName: string) {
  const host = createStackHost({ detectors: createDefaultDetectorPacks() });
  return host.detectProfile(join(fixtures, fixtureName));
}

describe("M-013 detector packs + DNA", () => {
  it("FE fixture → frontend + personas", async () => {
    const profile = await profileOf("m013-fe");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.domains).toContain(StackDomain.FRONTEND);
    expect(profile.value.personas).toContain(
      DeveloperPersona.FRONTEND_ENGINEER,
    );
    expect(profile.value.signals.some((s) => s.id === "frontend-next")).toBe(
      true,
    );

    const dna = assembleDnaReport({ profile: profile.value });
    expect(DnaReportSchema.safeParse(dna).success).toBe(true);
    expect(dna.frameworks).toEqual(
      expect.arrayContaining(["frontend-next", "frontend-react"]),
    );
    expect(dna.testRunners).toContain("vitest");
    expect(dna.primaryDomain).toBe(StackDomain.FRONTEND);
    expect(dna.rankedDomains[0]?.id).toBe(StackDomain.FRONTEND);
  });

  it("BE fixture → backend (Go)", async () => {
    const profile = await profileOf("m013-be");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.domains).toContain(StackDomain.BACKEND);
    expect(profile.value.personas).toContain(DeveloperPersona.BACKEND_ENGINEER);
    expect(profile.value.signals.some((s) => s.id === "backend-go")).toBe(true);
  });

  it("Mobile fixture → mobile + expo", async () => {
    const profile = await profileOf("m013-mobile");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.domains).toContain(StackDomain.MOBILE);
    expect(profile.value.personas).toContain(DeveloperPersona.MOBILE_ENGINEER);
    expect(profile.value.signals.some((s) => s.id === "mobile-expo")).toBe(
      true,
    );
  });

  it("Data-ML fixture → data_ml_ai personas", async () => {
    const profile = await profileOf("m013-data-ml");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.domains).toContain(StackDomain.DATA_ML_AI);
    expect(profile.value.personas).toEqual(
      expect.arrayContaining([
        DeveloperPersona.DATA_SCIENTIST,
        DeveloperPersona.ML_ENGINEER,
        DeveloperPersona.AI_ENGINEER,
      ]),
    );
  });

  it("multi-domain monorepo → multiple domains + personas", async () => {
    const profile = await profileOf("m013-mono");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.domains).toEqual(
      expect.arrayContaining([
        StackDomain.FRONTEND,
        StackDomain.BACKEND,
        StackDomain.DEVOPS_PLATFORM,
        StackDomain.TOOLING,
      ]),
    );
    const dna = assembleDnaReport({
      profile: profile.value,
      filePaths: ["apps/web/page.tsx", "apps/api/main.ts", "Dockerfile"],
    });
    expect(dna.stack?.personas).toContain(DeveloperPersona.FULLSTACK_ENGINEER);
    expect(dna.architectureHints).toEqual(
      expect.arrayContaining(["monorepo", "client_server", "infra_heavy"]),
    );
    expect((dna.stack?.personas ?? []).length).toBeGreaterThan(1);
    expect(dna.languages.some((l) => l.id === "typescript")).toBe(true);
    // Confidence ranking: FE/BE signals outweigh sparse devops markers.
    expect(dna.primaryDomain).not.toBe(StackDomain.DEVOPS_PLATFORM);
    expect([StackDomain.FRONTEND, StackDomain.BACKEND]).toContain(
      dna.primaryDomain,
    );
    expect(dna.rankedDomains.length).toBeGreaterThan(0);
    expect(dna.rankedDomains[0]?.id).toBe(dna.primaryDomain);
  });

  it("unknown empty dir → partial DNA, no throw", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-m013-empty-"));
    const host = createStackHost({ detectors: createDefaultDetectorPacks() });
    const profile = await host.detectProfile(root);
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.signals).toEqual([]);
    const dna = assembleDnaReport({ profile: profile.value });
    expect(dna.summary).toMatch(/Partial DNA/i);
    expect(dna.frameworks).toEqual([]);
    expect(dna.rankedDomains).toEqual([]);
    expect(dna.primaryDomain).toBeUndefined();
    expect(DnaReportSchema.safeParse(dna).success).toBe(true);
  });
});

describe("rankDomainsByConfidence (M-046)", () => {
  it("ranks frontend above devops when FE signals are stronger", () => {
    const profile: StackProfile = {
      rootPath: "/tmp/synthetic",
      generatedAt: "2026-07-23T00:00:00.000Z",
      domains: [
        StackDomain.DEVOPS_PLATFORM,
        StackDomain.FRONTEND,
        StackDomain.TOOLING,
      ],
      personas: [],
      summary: "synthetic",
      packages: [],
      signals: [
        {
          id: "devops-docker",
          domain: StackDomain.DEVOPS_PLATFORM,
          confidence: 0.7,
          personas: [],
          evidence: ["Dockerfile"],
        },
        {
          id: "frontend-react",
          domain: StackDomain.FRONTEND,
          confidence: 0.9,
          personas: [],
          evidence: ["package.json"],
        },
        {
          id: "frontend-next",
          domain: StackDomain.FRONTEND,
          confidence: 0.85,
          personas: [],
          evidence: ["package.json"],
        },
        {
          id: "pm-npm",
          domain: StackDomain.TOOLING,
          confidence: 0.4,
          personas: [],
          evidence: ["package-lock.json"],
        },
      ],
    };

    const ranked = rankDomainsByConfidence(profile);
    expect(ranked.map((r) => r.id)).toEqual([
      StackDomain.FRONTEND,
      StackDomain.DEVOPS_PLATFORM,
      StackDomain.TOOLING,
    ]);
    expect(ranked[0]?.signalCount).toBe(2);
    expect(ranked[0]?.confidence).toBeGreaterThan(ranked[1]?.confidence ?? 0);
    expect(primaryDomain(profile)).toBe(StackDomain.FRONTEND);

    const dna = assembleDnaReport({ profile });
    expect(dna.primaryDomain).toBe(StackDomain.FRONTEND);
    expect(dna.rankedDomains[0]).toEqual({
      id: StackDomain.FRONTEND,
      confidence: ranked[0]?.confidence,
    });
  });
});
