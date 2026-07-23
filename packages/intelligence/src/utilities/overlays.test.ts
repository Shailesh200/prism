import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  UtilityOverlayReportSchema,
  type UtilityOverlayKind,
} from "@prism/shared";
import { createStackHost } from "../host.js";
import { createDefaultDetectorPacks } from "../stack/packs.js";
import {
  buildUtilityOverlay,
  extractDesktopIpcChannels,
  listUtilityOverlayKinds,
} from "./overlays.js";

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

    const api = expectNodes("api-surface");
    expect(api.graph.nodes.some((n) => n.kind === "openapi")).toBe(true);
    const health = api.graph.nodes.find((n) =>
      String(n.attrs?.path ?? "").includes("health.controller"),
    );
    expect(health?.label).toBe("HealthController");

    const mobile = expectNodes("mobile-nav");
    expect(mobile.graph.nodes.some((n) => n.kind === "screen")).toBe(true);
    expect(mobile.graph.edges.some((e) => e.kind === "navigates")).toBe(true);
    expect(mobile.graph.nodes.some((n) => n.kind === "navigator")).toBe(true);

    const desktop = expectNodes("desktop-boundary");
    expect(desktop.graph.nodes.some((n) => n.kind === "main")).toBe(true);
    expect(desktop.graph.edges.length).toBeGreaterThan(0);
    expect(
      desktop.findings.some((f) => f.message.includes("app:get-version")),
    ).toBe(true);
    expect(
      desktop.findings.some((f) => f.message.includes("contextBridge")),
    ).toBe(true);
    const mainNode = desktop.graph.nodes.find((n) => n.kind === "main");
    expect(mainNode?.label).toMatch(/^main\.ts · main$/);

    expect(
      expectNodes("notebook-modules").graph.nodes.some(
        (n) => n.kind === "notebook",
      ),
    ).toBe(true);
    expect(
      expectNodes("data-pipeline-dag").graph.nodes.length,
    ).toBeGreaterThanOrEqual(1);
    const iac = expectNodes("iac-resources");
    expect(iac.graph.nodes.some((n) => n.kind === "terraform")).toBe(true);
    const ci = iac.graph.nodes.find((n) => n.kind === "ci");
    expect(ci).toBeDefined();
    expect(ci?.attrs?.provider).toBe("github-actions");
    expect(String(ci?.attrs?.dispatchers ?? "")).toContain("workflow_dispatch");
    expect(ci?.attrs?.canTrigger).toBe(true);
    const inputs = JSON.parse(String(ci?.attrs?.inputs ?? "[]")) as {
      name: string;
      type: string;
      required: boolean;
    }[];
    expect(inputs.map((i) => i.name)).toEqual(
      expect.arrayContaining(["environment", "dry_run"]),
    );
    expect(String(ci?.attrs?.dispatchTypes ?? "")).toContain("deploy");
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

  it("extractDesktopIpcChannels parses handle/invoke/expose", () => {
    const channels = extractDesktopIpcChannels(
      "preload.ts",
      `
        ipcMain.handle("a:one", () => {});
        ipcRenderer.invoke("a:two");
        contextBridge.exposeInMainWorld("api", {});
      `,
    );
    expect(channels.map((c) => c.name).sort()).toEqual([
      "a:one",
      "a:two",
      "api",
    ]);
    expect(channels.find((c) => c.name === "api")?.risk).toBe("medium");
  });
});
