import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IndexSnapshot } from "@prism/shared";
import { buildFeatureGraph } from "./build.js";
import { parseReadmeFeatureNames } from "./infer.js";
import { featureSlug } from "./slug.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "m012-features",
);

function syntheticSnapshot(files: IndexSnapshot["files"]): IndexSnapshot {
  return {
    repoId: "repo:m012",
    rootPath: fixtureRoot,
    indexedAt: "2026-01-01T00:00:00.000Z",
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed: files.filter((f) => f.status === "analyzed").length,
      filesSkipped: 0,
      durationMs: 0,
    },
    warnings: [],
  };
}

function analyzed(
  path: string,
  imports: Array<{ source: string; specifiers?: string[] }> = [],
): IndexSnapshot["files"][number] {
  return {
    path,
    pluginId: "typescript",
    contentHash: "h",
    status: "analyzed",
    symbols: [],
    imports: imports.map((i) => ({
      source: i.source,
      specifiers: i.specifiers ?? [],
    })),
    exports: [],
    references: [],
    diagnostics: [],
  };
}

describe("featureSlug", () => {
  it("normalizes package and labels", () => {
    expect(featureSlug("@fixture/auth")).toBe("fixture-auth");
    expect(featureSlug("Checkout Flow")).toBe("checkout-flow");
  });
});

describe("parseReadmeFeatureNames", () => {
  it("reads ## Features bullets", () => {
    expect(
      parseReadmeFeatureNames(
        "# X\n\n## Features\n\n- Auth\n- Billing\n\n## Other\n- skip\n",
      ),
    ).toEqual(["Auth", "Billing"]);
  });
});

describe("buildFeatureGraph", () => {
  it("yields ≥4 expected features with member files (golden N=4)", () => {
    const snap = syntheticSnapshot([
      analyzed("packages/auth/src/index.ts"),
      {
        path: "packages/auth/package.json",
        pluginId: null,
        contentHash: "p",
        status: "skipped_unsupported",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
      analyzed("packages/billing/src/index.ts"),
      {
        path: "packages/billing/package.json",
        pluginId: null,
        contentHash: "p",
        status: "skipped_unsupported",
        symbols: [],
        imports: [],
        exports: [],
        references: [],
        diagnostics: [],
      },
      analyzed("src/routes/checkout/page.ts", [
        {
          source: "../../../packages/billing/src/index.js",
          specifiers: ["charge"],
        },
      ]),
      analyzed("src/routes/checkout/cart.ts"),
      analyzed("src/features/dashboard/Dashboard.ts", [
        {
          source: "../../../packages/auth/src/index.js",
          specifiers: ["login"],
        },
      ]),
      analyzed("src/features/dashboard/widgets.ts"),
    ]);

    const result = buildFeatureGraph(snap);
    const slugs = result.features.map((f) => f.slug);
    for (const expected of ["auth", "billing", "checkout", "dashboard"]) {
      expect(slugs).toContain(expected);
    }
    expect(result.features.length).toBeGreaterThanOrEqual(4);

    for (const slug of ["auth", "billing", "checkout", "dashboard"]) {
      const feature = result.features.find((f) => f.slug === slug);
      expect(feature).toBeDefined();
      expect(feature!.memberFiles.length).toBeGreaterThan(0);
      expect(feature!.confidence).toBeGreaterThan(0);
      expect(feature!.evidence.length).toBeGreaterThan(0);
    }

    expect(
      result.graph.edges.some(
        (e) => e.kind === "contains" && e.from === "feature:checkout",
      ),
    ).toBe(true);

    // dashboard → auth via import
    expect(
      result.graph.edges.some(
        (e) =>
          e.kind === "related" &&
          e.from === "feature:dashboard" &&
          e.to === "feature:auth",
      ),
    ).toBe(true);
  });
});
