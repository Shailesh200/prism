import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StackDomain, StackProfileSchema } from "@prism/shared";
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
