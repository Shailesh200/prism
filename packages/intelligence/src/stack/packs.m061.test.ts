import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StackDomain } from "@repo-prism/shared";
import { createStackHost } from "../host.js";
import {
  STACK_DETECTION_THRESHOLD,
  STACK_DEVDEP_ONLY_CAP,
  STACK_WEIGHT_CONFIG,
  STACK_WEIGHT_PATH,
  STACK_WEIGHT_PROD_DEP,
  scoreMultiSignal,
} from "./manifest.js";
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

describe("scoreMultiSignal (M-061 P-E1)", () => {
  it("uses dep +0.5, config +0.3, path +0.2 with threshold 0.6", () => {
    expect(STACK_WEIGHT_PROD_DEP).toBe(0.5);
    expect(STACK_WEIGHT_CONFIG).toBe(0.3);
    expect(STACK_WEIGHT_PATH).toBe(0.2);
    expect(STACK_DETECTION_THRESHOLD).toBe(0.6);

    expect(
      scoreMultiSignal({ prodDep: true, evidence: ["package.json"] }),
    ).toBeNull();
    expect(
      scoreMultiSignal({
        prodDep: true,
        path: true,
        evidence: ["package.json", "src/App.tsx"],
      })?.confidence,
    ).toBeCloseTo(0.7);

    expect(
      scoreMultiSignal({
        prodDep: true,
        config: true,
        evidence: ["package.json", "next.config.mjs"],
      })?.confidence,
    ).toBeCloseTo(0.8);
  });

  it("caps devDependencies-only at 0.4 (below threshold)", () => {
    expect(STACK_DEVDEP_ONLY_CAP).toBe(0.4);
    expect(
      scoreMultiSignal({
        devDepOnly: true,
        path: true,
        evidence: ["package.json"],
      }),
    ).toBeNull();
  });
});

describe("negative fixtures must not detect (M-061 P-E1)", () => {
  it("does not detect frontend-react when react is only in devDependencies", async () => {
    const profile = await profileOf("m061-neg-react-devdeps");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.signals.some((s) => s.id === "frontend-react")).toBe(
      false,
    );
    expect(profile.value.domains).not.toContain(StackDomain.FRONTEND);
  });

  it("does not detect devops-k8s for a docs folder named k8s", async () => {
    const profile = await profileOf("m061-neg-docs-k8s");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.signals.some((s) => s.id === "devops-k8s")).toBe(
      false,
    );
    expect(profile.value.domains).not.toContain(StackDomain.DEVOPS_PLATFORM);
  });

  it("does not detect django from an unrelated manage.py", async () => {
    const profile = await profileOf("m061-neg-manage-py");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(
      profile.value.signals.some((s) => s.id === "backend-python-django"),
    ).toBe(false);
    expect(profile.value.domains).not.toContain(StackDomain.BACKEND);
  });

  it("does not detect data-jupyter from a sample .ipynb in a non-ML repo", async () => {
    const profile = await profileOf("m061-neg-sample-ipynb");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.signals.some((s) => s.id === "data-jupyter")).toBe(
      false,
    );
    expect(profile.value.domains).not.toContain(StackDomain.DATA_ML_AI);
  });
});

describe("positive fixtures still detect (M-061 regression)", () => {
  it("still detects Next/React on m013-fe", async () => {
    const profile = await profileOf("m013-fe");
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    expect(profile.value.signals.some((s) => s.id === "frontend-next")).toBe(
      true,
    );
    expect(profile.value.signals.some((s) => s.id === "frontend-react")).toBe(
      true,
    );
    for (const id of ["frontend-next", "frontend-react"]) {
      const signal = profile.value.signals.find((s) => s.id === id);
      expect(signal?.confidence).toBeGreaterThanOrEqual(
        STACK_DETECTION_THRESHOLD,
      );
    }
  });
});
