import { describe, expect, it } from "vitest";
import { originAllowed, tokensMatch } from "./auth.js";

describe("loopback auth", () => {
  it("allows missing origin and loopback origins", () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed("http://127.0.0.1:17330")).toBe(true);
    expect(originAllowed("http://localhost:17330")).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(originAllowed("https://evil.example")).toBe(false);
  });

  it("requires an exact token match", () => {
    expect(tokensMatch("secret", "secret")).toBe(true);
    expect(tokensMatch("secret", "other")).toBe(false);
    expect(tokensMatch("secret", undefined)).toBe(false);
  });
});
