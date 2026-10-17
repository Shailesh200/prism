import { describe, expect, it } from "vitest";
import { serialiseForMcp, VOLATILE_KEYS } from "./tool-registry.js";

describe("serialiseForMcp (plan P16)", () => {
  it("CACHE-2 puts volatile fields last in every object, values untouched", () => {
    const value = {
      generatedAt: "2026-10-15T00:00:00.000Z",
      repo: "demo",
      items: [{ durationMs: 4, path: "a.ts" }],
      budget: { maxTokens: 200 },
      nested: { indexedAt: "x", files: 3 },
    };
    const text = serialiseForMcp(value, {});
    expect(JSON.parse(text)).toEqual(value);
    expect(
      text.startsWith(
        '{"repo":"demo","items":[{"path":"a.ts","durationMs":4}]',
      ),
    ).toBe(true);
    expect(text).toContain('"nested":{"files":3,"indexedAt":"x"}');
    expect(
      text.endsWith(
        '"generatedAt":"2026-10-15T00:00:00.000Z","budget":{"maxTokens":200}}',
      ),
    ).toBe(true);
  });

  it("CACHE-2 keeps only the top-level clock stamp", () => {
    const text = serialiseForMcp(
      {
        generatedAt: "t0",
        packages: [{ id: "a", generatedAt: "t1" }],
        dna: { generatedAt: "t2", x: 1 },
      },
      {},
    );
    expect(JSON.parse(text)).toEqual({
      packages: [{ id: "a" }],
      dna: { x: 1 },
      generatedAt: "t0",
    });
    expect(text.endsWith('"generatedAt":"t0"}')).toBe(true);
  });

  it("CACHE-2 two answers that differ only in volatile fields share everything before them", () => {
    const a = serialiseForMcp({ generatedAt: "t1", files: ["a", "b"] }, {});
    const b = serialiseForMcp({ generatedAt: "t2", files: ["a", "b"] }, {});
    const stable = '{"files":["a","b"],';
    expect(a.startsWith(stable) && b.startsWith(stable)).toBe(true);
    expect(VOLATILE_KEYS.has("generatedAt")).toBe(true);
  });
});
