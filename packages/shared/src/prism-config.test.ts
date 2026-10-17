import { describe, expect, it } from "vitest";
import {
  maxFileSizeOptionFromBytes,
  maxFileSizeOptionToBytes,
  mergeIndexLimits,
  parsePrismConfig,
} from "./prism-config.js";

describe("prism-config (M-057 P-B6)", () => {
  it("parses a valid config", () => {
    const parsed = parsePrismConfig({
      excludeGlobs: ["vendor/**"],
      maxFileBytes: 1_048_576,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.excludeGlobs).toEqual(["vendor/**"]);
      expect(parsed.value.maxFileBytes).toBe(1_048_576);
    }
  });

  it("warns about an unknown key and ignores it, so a newer Prism's key never breaks this one (Arc)", () => {
    const warnings: string[] = [];
    const parsed = parsePrismConfig(
      { sensitivePaths: ["secrets/**"], excludeGlobs: ["gen/**"] },
      (message) => warnings.push(message),
    );
    expect(parsed).toEqual({ ok: true, value: { excludeGlobs: ["gen/**"] } });
    expect(warnings).toEqual([
      "Prism: ignoring unknown key in .prism/config.json: sensitivePaths",
    ]);
  });

  it("still rejects a known key with a bad value, and warns about nothing when all keys are known", () => {
    const warnings: string[] = [];
    expect(
      parsePrismConfig({ maxFileBytes: "big" }, (m) => warnings.push(m)).ok,
    ).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("precedence is flags > config > defaults", () => {
    const merged = mergeIndexLimits({
      defaults: { maxFileBytes: 5_000_000, extraIgnorePatterns: ["a/**"] },
      config: { maxFileBytes: 1_000_000, excludeGlobs: ["b/**"] },
      flags: { maxFileBytes: 500_000, extraIgnorePatterns: ["c/**"] },
    });
    expect(merged.maxFileBytes).toBe(500_000);
    expect(merged.extraIgnorePatterns).toEqual(["a/**", "b/**", "c/**"]);
  });

  it("config null maxFileBytes means no limit", () => {
    const merged = mergeIndexLimits({
      defaults: { maxFileBytes: 5_000_000, extraIgnorePatterns: [] },
      config: { maxFileBytes: null },
    });
    expect(merged.maxFileBytes).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("maps IDE size options to bytes", () => {
    expect(maxFileSizeOptionToBytes("5mb")).toBe(5 * 1024 * 1024);
    expect(maxFileSizeOptionToBytes("none")).toBeNull();
  });

  it("maps bytes back to IDE size options for settings hydration", () => {
    expect(maxFileSizeOptionFromBytes(5 * 1024 * 1024)).toBe("5mb");
    expect(maxFileSizeOptionFromBytes(256 * 1024)).toBe("256kb");
    expect(maxFileSizeOptionFromBytes(null)).toBe("none");
    // Custom hand-edited sizes and absent fields leave the UI selection alone.
    expect(maxFileSizeOptionFromBytes(3 * 1024 * 1024)).toBeUndefined();
    expect(maxFileSizeOptionFromBytes(undefined)).toBeUndefined();
  });

  it("round-trips every IDE size option through bytes", () => {
    for (const option of ["256kb", "1mb", "5mb", "10mb", "none"] as const) {
      expect(maxFileSizeOptionFromBytes(maxFileSizeOptionToBytes(option))).toBe(
        option,
      );
    }
  });
});
