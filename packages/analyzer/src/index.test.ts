import { describe, expect, it } from "vitest";
import {
  ANALYZER_SPI_VERSION,
  PluginRegistry,
  createAnalyzerHost,
  createNoopPlugin,
} from "./index.js";

describe("@prism/analyzer exports", () => {
  it("exposes SPI version and host factory", () => {
    expect(ANALYZER_SPI_VERSION).toBe(1);
    expect(typeof createNoopPlugin).toBe("function");
    expect(typeof createAnalyzerHost).toBe("function");
    expect(new PluginRegistry().list()).toEqual([]);
  });
});
