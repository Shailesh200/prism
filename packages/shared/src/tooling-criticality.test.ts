import { describe, expect, it } from "vitest";
import {
  classifyToolingRoot,
  isRepoCriticalPath,
} from "./tooling-criticality.js";

describe("classifyToolingRoot", () => {
  it("marks vitest/jest/playwright configs critical", () => {
    expect(classifyToolingRoot("packages/ai/vitest.config.ts")).toBe(
      "critical",
    );
    expect(classifyToolingRoot("jest.config.js")).toBe("critical");
    expect(classifyToolingRoot("playwright.config.ts")).toBe("critical");
  });

  it("marks package.json and tsconfig critical", () => {
    expect(classifyToolingRoot("package.json")).toBe("critical");
    expect(classifyToolingRoot("tsconfig.json")).toBe("critical");
    expect(classifyToolingRoot("packages/core/tsconfig.build.json")).toBe(
      "critical",
    );
  });

  it("marks eslint/env elevated", () => {
    expect(classifyToolingRoot("eslint.config.js")).toBe("elevated");
    expect(classifyToolingRoot(".env")).toBe("elevated");
    expect(classifyToolingRoot("turbo.json")).toBe("elevated");
  });

  it("returns none for ordinary source", () => {
    expect(classifyToolingRoot("src/util.ts")).toBe("none");
    expect(isRepoCriticalPath("src/util.ts")).toBe(false);
    expect(isRepoCriticalPath("vitest.config.ts")).toBe(true);
  });
});
