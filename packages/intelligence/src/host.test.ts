import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StackDomain, StackProfileSchema } from "@repo-prism/shared";
import { STACK_DETECTOR_SPI_VERSION } from "./spi-version.js";
import {
  createNodejsManifestDetector,
  createUnknownDetector,
} from "./detectors.js";
import { createStackHost } from "./host.js";

describe("createStackHost", () => {
  it("lists registered detectors", () => {
    const host = createStackHost({
      detectors: [createUnknownDetector(), createNodejsManifestDetector()],
    });
    expect(host.listDetectors().map((d) => d.id)).toEqual([
      "unknown",
      "nodejs-manifest",
    ]);
  });

  it("detects nodejs-manifest tooling signal from package.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-stack-"));
    await writeFile(
      join(root, "package.json"),
      '{\n  "name": "demo",\n  "private": true\n}\n',
    );

    const host = createStackHost({
      detectors: [createUnknownDetector(), createNodejsManifestDetector()],
    });
    const profile = await host.detectProfile(root);
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;

    expect(StackProfileSchema.safeParse(profile.value).success).toBe(true);
    expect(profile.value.domains).toContain(StackDomain.TOOLING);
    expect(profile.value.signals.some((s) => s.id === "nodejs-manifest")).toBe(
      true,
    );
  });

  it("returns empty signals when no manifests match", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-stack-empty-"));
    const host = createStackHost({
      detectors: [createUnknownDetector(), createNodejsManifestDetector()],
    });
    const profile = await host.detectProfile(root);
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.signals).toEqual([]);
    expect(profile.value.packages).toEqual([]);
    expect(profile.value.summary).toMatch(/no stack signals/i);
  });
});

describe("a signal recognised more than once", () => {
  /**
   * Two detectors recognising the same tool from different files used to
   * produce two signals with the same id, because the dedupe key included the
   * evidence. The screens key their rows by id, so this reached the user as
   * duplicate rows and a React duplicate-key warning.
   */
  function detectorEmitting(id: string, evidence: string, confidence: number) {
    return {
      id: `test-${evidence}`,
      spiVersion: STACK_DETECTOR_SPI_VERSION,
      domains: [StackDomain.TOOLING],
      personaHints: [],
      detect: async () => ({
        ok: true as const,
        value: [
          {
            id,
            domain: StackDomain.TOOLING,
            title: "Moon",
            confidence,
            evidence: [evidence],
            personas: ["build"],
          },
        ],
      }),
    };
  }

  it("appears once, carrying every place it was found", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-stack-dupe-"));
    const host = createStackHost({
      detectors: [
        detectorEmitting("mono-moon", ".moon/workspace.yml", 0.6),
        detectorEmitting("mono-moon", "moon.yml", 0.9),
      ],
    });

    const profile = await host.detectProfile(root);
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;

    const moon = profile.value.signals.filter((s) => s.id === "mono-moon");
    expect(moon).toHaveLength(1);
    expect(moon[0]?.evidence).toEqual([".moon/workspace.yml", "moon.yml"]);
    // The firmer of the two readings. Taking the first would make the answer
    // depend on detector registration order.
    expect(moon[0]?.confidence).toBe(0.9);
  });

  it("keeps signals with the same id in different domains apart", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-stack-domains-"));
    const host = createStackHost({
      detectors: [
        detectorEmitting("shared-id", "a.yml", 0.5),
        {
          id: "test-other-domain",
          spiVersion: STACK_DETECTOR_SPI_VERSION,
          domains: [StackDomain.FRONTEND],
          personaHints: [],
          detect: async () => ({
            ok: true as const,
            value: [
              {
                id: "shared-id",
                domain: StackDomain.FRONTEND,
                title: "Other",
                confidence: 0.5,
                evidence: ["b.yml"],
                personas: [],
              },
            ],
          }),
        },
      ],
    });

    const profile = await host.detectProfile(root);
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;

    // Identity is id *and* domain. Collapsing on id alone would silently drop
    // a genuinely different finding.
    expect(
      profile.value.signals.filter((s) => s.id === "shared-id"),
    ).toHaveLength(2);
  });
});
