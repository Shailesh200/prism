import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StackDomain, StackProfileSchema } from "@repo-prism/shared";
import { createStackHost } from "../host.js";
import { createDefaultDetectorPacks } from "./packs.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
);

describe("M-041 Mono-v1 workspace rollup", () => {
  it("m013-mono → packages[] + tooling + additive domains", async () => {
    const host = createStackHost({ detectors: createDefaultDetectorPacks() });
    const rollup = await host.detectWorkspaceProfile(
      join(fixtures, "m013-mono"),
    );
    expect(rollup.ok).toBe(true);
    if (!rollup.ok) return;

    expect(StackProfileSchema.safeParse(rollup.value).success).toBe(true);
    expect(rollup.value.packages.length).toBeGreaterThanOrEqual(3);
    expect(rollup.value.domains).toEqual(
      expect.arrayContaining([
        StackDomain.FRONTEND,
        StackDomain.BACKEND,
        StackDomain.TOOLING,
      ]),
    );
    expect(
      rollup.value.signals.some(
        (s) =>
          s.id === "mono-turbo" || s.id === "pm-pnpm" || s.id.startsWith("pm-"),
      ),
    ).toBe(true);

    const web = rollup.value.packages.find(
      (p) => p.id === "@prism-fixture/m013-web",
    );
    const api = rollup.value.packages.find(
      (p) => p.id === "@prism-fixture/m013-api",
    );
    expect(web?.profile.domains).toContain(StackDomain.FRONTEND);
    expect(api?.profile.domains).toContain(StackDomain.BACKEND);
    expect(web?.profile.domains).not.toContain(StackDomain.BACKEND);
  });
});
