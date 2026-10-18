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
  "addPrismToGitignore",
  "analyze",
  "blastRadius",
  "checkAgentsMd",
  "checkRunPlan",
  "close",
  "explainArea",
  "exploreCode",
  "exportGraph",
  "findReferences",
  "findRoute",
  "findSymbol",
  "generateAgentsMd",
  "getChangedPaths",
  "getCycles",
  "getDependencyGraph",
  "getDna",
  "getGitActivity",
  "getIndex",
  "getIndexFreshness",
  "getKnowledgeGraph",
  "getPrismGitignoreStatus",
  "getSelectedPackage",
  "getStackProfile",
  "graph",
  "guardSession",
  "index",
  "listFindings",
  "listLandmarks",
  "listMutedFindings",
  "listPackages",
  "muteFinding",
  "notifyWatchPaths",
  "prepareChange",
  "reindex",
  "renameImpact",
  "repoMap",
  "resolveFinding",
  "reviewChanges",
  "safeDelete",
  "searchSymbols",
  "selectPackage",
  "startWatch",
  "status",
  "stopWatch",
  "testImpact",
  "unmuteFinding",
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
    expect(Core.PRISM_CORE_VERSION).toBe("2.0.2");
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
    expect(client.version).toBe(Core.PRISM_CORE_VERSION);
    expect(client.apiLevel).toBe(1);
  });

  it("enables map and navigation capabilities by default", () => {
    const caps = Prism.create().capabilities;
    expect(caps.indexing).toBe(true);
    expect(caps.graphs).toBe(true);
    expect(caps.intelligence).toBe(true);
    expect(caps.impact).toBe(true);
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
