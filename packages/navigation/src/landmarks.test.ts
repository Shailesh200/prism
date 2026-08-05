import { describe, expect, it } from "vitest";
import {
  LandmarkSchema,
  unsafeRepoId,
  type FeatureInfo,
  type IndexSnapshot,
} from "@repo-prism/shared";
import { listLandmarks } from "./landmarks.js";

describe("listLandmarks", () => {
  it("detects entrypoints, package roots, and features", () => {
    const snapshot: IndexSnapshot = {
      repoId: unsafeRepoId("repo:nav"),
      rootPath: "/tmp",
      indexedAt: "2026-07-20T00:00:00.000Z",
      files: [
        {
          path: "src/main.ts",
          pluginId: "typescript",
          contentHash: "a",
          status: "analyzed",
          symbols: [],
          imports: [],
          exports: [],
          references: [],
          diagnostics: [],
        },
        {
          path: "package.json",
          pluginId: "noop",
          contentHash: "b",
          status: "skipped_unsupported",
          symbols: [],
          imports: [],
          exports: [],
          references: [],
          diagnostics: [],
        },
      ],
      stats: {
        filesTotal: 2,
        filesIndexed: 1,
        filesSkipped: 1,
        durationMs: 1,
      },
      warnings: [],
    };
    const features: FeatureInfo[] = [
      {
        id: "feat:checkout",
        name: "Checkout",
        slug: "checkout",
        confidence: 0.8,
        memberFiles: ["src/routes/checkout/page.ts"],
        evidence: [],
      },
    ];
    const landmarks = listLandmarks(snapshot, features);
    expect(landmarks.every((l) => LandmarkSchema.safeParse(l).success)).toBe(
      true,
    );
    expect(landmarks.some((l) => l.kind === "entrypoint")).toBe(true);
    expect(landmarks.some((l) => l.kind === "package-root")).toBe(true);
    expect(landmarks.some((l) => l.kind === "feature")).toBe(true);
  });
});
