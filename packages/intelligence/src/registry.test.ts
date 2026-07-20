import { describe, expect, it } from "vitest";
import { PrismErrorCode, StackDomain, ok } from "@prism/shared";
import { StackDetectorRegistry } from "./registry.js";
import { createUnknownDetector } from "./detectors.js";
import { STACK_DETECTOR_SPI_VERSION } from "./spi-version.js";
import type { StackDetector } from "./types.js";

function stub(
  overrides: Partial<StackDetector> & Pick<StackDetector, "id">,
): StackDetector {
  return {
    spiVersion: STACK_DETECTOR_SPI_VERSION,
    domains: [StackDomain.UNKNOWN],
    personaHints: [],
    async detect() {
      return ok([]);
    },
    ...overrides,
  };
}

describe("StackDetectorRegistry", () => {
  it("registers and lists detectors", () => {
    const registry = new StackDetectorRegistry();
    expect(registry.register(createUnknownDetector()).ok).toBe(true);
    expect(registry.list()).toEqual([
      expect.objectContaining({
        id: "unknown",
        spiVersion: STACK_DETECTOR_SPI_VERSION,
      }),
    ]);
  });

  it("rejects duplicate ids", () => {
    const registry = new StackDetectorRegistry();
    expect(registry.register(createUnknownDetector()).ok).toBe(true);
    const again = registry.register(createUnknownDetector());
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe(PrismErrorCode.VALIDATION);
  });

  it("rejects incompatible spiVersion", () => {
    const registry = new StackDetectorRegistry();
    const bad = registry.register(stub({ id: "future", spiVersion: 99 }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe(PrismErrorCode.UNSUPPORTED);
  });
});
