import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./update.js";

describe("isNewerVersion", () => {
  it("compares npm semver triplets", () => {
    expect(isNewerVersion("1.9.1", "1.9.0")).toBe(true);
    expect(isNewerVersion("1.9.0", "1.9.0")).toBe(false);
    expect(isNewerVersion("1.8.9", "1.9.0")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true);
  });
});
