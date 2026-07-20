import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { DeveloperPersona, DnaReportSchema, StackDomain } from "@prism/shared";
import { createStackHost } from "../host.js";
import { assembleDnaReport } from "./dna.js";
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
    expect(DnaReportSchema.safeParse(dna).success).toBe(true);
  });
});
