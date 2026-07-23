import { describe, expect, it } from "vitest";
import * as Core from "./index.js";
import { Prism } from "./prism.js";

/** Locked PrismClient own keys (M-025). Additive keys require inventory update. */
const PRISM_CLIENT_KEYS = [
  "apiLevel",
  "capabilities",
  "getStackProfile",
  "listLanguagePlugins",
  "listStackDetectors",
  "openRepository",
  "version",
] as const;

/**
 * Locked PrismWorkspace method names (M-025). Renames/removals fail this test;
 * new methods must be added here + CORE_SDK.md stability table.
 */
const WORKSPACE_METHODS = [
  "analyze",
  "blastRadius",
  "breakingChangeHints",
  "close",
  "exploreCode",
  "findReferences",
  "findRoute",
  "findSymbol",
  "getBackendReport",
  "getConsent",
  "getCwvReport",
  "getCycles",
  "getDependencyGraph",
  "getDna",
  "getEngineeringHealth",
  "getFeatureGraph",
  "getGitActivity",
  "getHealth",
  "getHealthHistory",
  "getHealthHistoryBackfillStatus",
  "getIndex",
  "getIngestArtifact",
  "getKnowledgeGraph",
  "getPersonaPresets",
  "getRegionMovers",
  "getRepositoryMap",
  "getSecurityReport",
  "getSelectedPackage",
  "getStackProfile",
  "getTestingReport",
  "getUtilityJob",
  "getUtilityOverlay",
  "index",
  "ingestCoverageFromWorkspace",
  "intelligence",
  "listFeatures",
  "listIngestArtifacts",
  "listLandmarks",
  "listPackages",
  "listUtilityJobs",
  "listUtilityOverlayKinds",
  "navigateFeature",
  "reindex",
  "renameImpact",
  "safeDelete",
  "selectPackage",
  "setConsent",
  "startHealthHistoryBackfill",
  "startUtilityJob",
  "status",
  "testImpact",
] as const;

const REQUIRED_EXPORTS = [
  "Prism",
  "PRISM_CORE_VERSION",
  "PRISM_API_LEVEL",
  "STUB_CAPABILITIES",
  "ok",
  "err",
  "PrismErrorCode",
] as const;

describe("Core API surface contract (M-025)", () => {
  it("advertises freeze version and api level", () => {
    expect(Core.PRISM_CORE_VERSION).toBe("0.1.0");
    expect(Core.PRISM_API_LEVEL).toBe(1);
  });

  it("exports the required public symbols", () => {
    for (const name of REQUIRED_EXPORTS) {
      expect(Core).toHaveProperty(name);
    }
  });

  it("locks PrismClient keys", () => {
    const client = Prism.create();
    expect(Object.keys(client).sort()).toEqual([...PRISM_CLIENT_KEYS]);
    expect(client.version).toBe("0.1.0");
    expect(client.apiLevel).toBe(1);
  });

  it("enables map and navigation capabilities by default", () => {
    const caps = Prism.create().capabilities;
    expect(caps.indexing).toBe(true);
    expect(caps.graphs).toBe(true);
    expect(caps.intelligence).toBe(true);
    expect(caps.impact).toBe(true);
    expect(caps.map).toBe(true);
    expect(caps.navigation).toBe(true);
  });

  it("locks PrismWorkspace method names", () => {
    const opened = Prism.create().openRepository(process.cwd());
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const methods = Object.keys(ws)
      .filter((k) => typeof (ws as Record<string, unknown>)[k] === "function")
      .sort();
    expect(methods).toEqual([...WORKSPACE_METHODS]);
    ws.close();
  });
});
