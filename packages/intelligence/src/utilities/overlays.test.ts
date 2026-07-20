import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  UtilityOverlayReportSchema,
  type UtilityOverlayKind,
} from "@prism/shared";
import { createStackHost } from "../host.js";
import { createDefaultDetectorPacks } from "../stack/packs.js";
import { buildUtilityOverlay, listUtilityOverlayKinds } from "./overlays.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "m041-overlays",
);

describe("utility overlays (M-041 P2–P7 / Mono-v2)", () => {
  it("catalog lists all Gate B kinds", () => {
    const kinds = listUtilityOverlayKinds().map((k) => k.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "api-surface",
        "mobile-nav",
        "desktop-boundary",
        "notebook-modules",
        "data-pipeline-dag",
        "iac-resources",
        "embedded-regions",
        "game-regions",
        "qa-test-gaps",
        "security-surface",
        "cross-package-impact",
        "domain-regions",
      ]),
    );
    expect(kinds).toHaveLength(12);
  });

  it("scans primary backlog markers per kind", async () => {
    const host = createStackHost({ detectors: createDefaultDetectorPacks() });
    const stack = await host.detectWorkspaceProfile(fixture);
    expect(stack.ok).toBe(true);
    if (!stack.ok) return;

    const expectNodes = (kind: UtilityOverlayKind, min = 1) => {
      const report = buildUtilityOverlay({
        workspaceRoot: fixture,
        kind,
        stack: stack.value,
      });
      expect(UtilityOverlayReportSchema.safeParse(report).success).toBe(true);
      expect(report.graph.nodes.length).toBeGreaterThanOrEqual(min);
      return report;
    };

    expect(
      expectNodes("api-surface").graph.nodes.some((n) => n.kind === "openapi"),
    ).toBe(true);
    expect(
      expectNodes("mobile-nav").graph.nodes.some((n) => n.kind === "screen"),
    ).toBe(true);
    expect(
      expectNodes("desktop-boundary").graph.nodes.some(
        (n) => n.kind === "main",
      ),
    ).toBe(true);
    expect(
      expectNodes("notebook-modules").graph.nodes.some(
        (n) => n.kind === "notebook",
      ),
    ).toBe(true);
    expect(
      expectNodes("data-pipeline-dag").graph.nodes.length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      expectNodes("iac-resources").graph.nodes.some(
        (n) => n.kind === "terraform",
      ),
    ).toBe(true);
    expect(
      expectNodes("embedded-regions").graph.nodes.some(
        (n) => n.kind === "firmware",
      ),
    ).toBe(true);
    expect(
      expectNodes("game-regions").graph.nodes.some((n) => n.kind === "content"),
    ).toBe(true);
    expect(
      expectNodes("security-surface").graph.nodes.some(
        (n) => n.kind === "auth-crypto",
      ),
    ).toBe(true);

    const regions = expectNodes("domain-regions", 1);
    expect(regions.mapLayer.id).toBe("layer:domain-regions");
  });
});
