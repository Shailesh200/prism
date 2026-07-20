import { describe, expect, it } from "vitest";
import {
  STACK_DETECTOR_SPI_VERSION,
  StackDetectorRegistry,
  buildDependencyGraph,
  createStackHost,
  createUnknownDetector,
} from "./index.js";

describe("@prism/intelligence exports", () => {
  it("exposes stack SPI factories", () => {
    expect(STACK_DETECTOR_SPI_VERSION).toBe(1);
    expect(typeof createStackHost).toBe("function");
    expect(typeof createUnknownDetector).toBe("function");
    expect(typeof buildDependencyGraph).toBe("function");
    expect(new StackDetectorRegistry().list()).toEqual([]);
  });
});
