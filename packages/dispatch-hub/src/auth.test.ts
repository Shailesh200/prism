import { describe, expect, it } from "vitest";
import { originAllowed, tokensMatch, hubCookieHeader } from "./auth.js";

describe("loopback auth", () => {
  it("allows missing origin and loopback origins", () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed("http://127.0.0.1:17330")).toBe(true);
    expect(originAllowed("http://localhost:17330")).toBe(true);
    expect(originAllowed("http://prism.localhost:17330")).toBe(true);
    expect(originAllowed("http://prismhq.localhost:17330")).toBe(true);
  });

  it("allows the branded loopback alias by exact name", () => {
    expect(originAllowed("http://local.prismhq.in:17330")).toBe(true);
    expect(originAllowed("https://evil.example")).toBe(false);
    expect(originAllowed("https://evil.prismhq.in")).toBe(false);
  });

  it("requires an exact token match", () => {
    expect(tokensMatch("secret", "secret")).toBe(true);
    expect(tokensMatch("secret", "other")).toBe(false);
    expect(tokensMatch("secret", undefined)).toBe(false);
  });

  it("sets a same-origin session cookie for the hub token", () => {
    expect(hubCookieHeader("abc")).toMatch(/prism_hub=abc/);
    expect(hubCookieHeader("abc")).toMatch(/HttpOnly/);
    expect(hubCookieHeader("abc")).toMatch(/SameSite=Strict/);
  });
});
