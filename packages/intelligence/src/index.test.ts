import { describe, expect, it } from "vitest";
import {
  STACK_DETECTOR_SPI_VERSION,
  StackDetectorRegistry,
  assembleDnaReport,
  assembleIntelligenceReport,
  buildDependencyGraph,
  buildFeatureGraph,
  buildKnowledgeGraph,
  createDefaultDetectorPacks,
  createStackHost,
  createUnknownDetector,
  createUtilitiesSession,
  primaryDomain,
  rankDomainsByConfidence,
} from "./index.js";

describe("@prism/intelligence exports", () => {
  it("exposes stack SPI factories", () => {
    expect(STACK_DETECTOR_SPI_VERSION).toBe(1);
    expect(typeof createStackHost).toBe("function");
    expect(typeof createUnknownDetector).toBe("function");
    expect(typeof createDefaultDetectorPacks).toBe("function");
    expect(typeof assembleDnaReport).toBe("function");
    expect(typeof primaryDomain).toBe("function");
    expect(typeof rankDomainsByConfidence).toBe("function");
    expect(typeof assembleIntelligenceReport).toBe("function");
    expect(typeof createUtilitiesSession).toBe("function");
    expect(typeof buildDependencyGraph).toBe("function");
    expect(typeof buildKnowledgeGraph).toBe("function");
    expect(typeof buildFeatureGraph).toBe("function");
    expect(createDefaultDetectorPacks().length).toBeGreaterThan(10);
    expect(new StackDetectorRegistry().list()).toEqual([]);
  });
});
