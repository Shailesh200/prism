import { describe, expect, it } from "vitest";
import { describeSignal } from "./stack-signal-meta.js";

describe("describeSignal", () => {
  it("maps known brand signals to Simple Icons + friendly labels", () => {
    const react = describeSignal("frontend-react", "frontend");
    expect(react.category).toBe("Frontend");
    expect(react.label).toBe("React");
    expect(react.icon).toBeTruthy();

    const nest = describeSignal("backend-nest", "backend");
    expect(nest.category).toBe("Backend");
    expect(nest.label).toBe("NestJS");

    const vite = describeSignal("frontend-vite", "frontend");
    expect(vite.label).toBe("Vite");
  });

  it("falls back to category icon (or wrench) for unknown ids", () => {
    const knownPrefix = describeSignal(
      "frontend-obscure-framework",
      "frontend",
    );
    expect(knownPrefix.category).toBe("Frontend");
    expect(knownPrefix.label).toBe("Obscure Framework");
    expect(knownPrefix.icon).toBeTruthy();

    const totallyUnknown = describeSignal("weird-signal-xyz", "custom");
    expect(totallyUnknown.category).toBe("Custom");
    expect(totallyUnknown.label).toBe("Weird Signal Xyz");
    expect(totallyUnknown.icon).toBeTruthy();
  });
});
