import { describe, expect, it } from "vitest";
import {
  avatarGradient,
  avatarInitials,
  gravatarUrl,
  hashString,
} from "./avatar-util.js";
import { md5 } from "./md5.js";

describe("avatarInitials", () => {
  it("derives initials from names and email-like handles", () => {
    expect(avatarInitials("Ada Lovelace")).toBe("AL");
    expect(avatarInitials("grace")).toBe("G");
    expect(avatarInitials("jane.doe")).toBe("JD");
    expect(avatarInitials("linus_torvalds")).toBe("LT");
  });

  it("falls back to a placeholder for empty input", () => {
    expect(avatarInitials("   ")).toBe("?");
  });
});

describe("avatarGradient", () => {
  it("is deterministic and case-insensitive", () => {
    expect(avatarGradient("Dev@Example.com")).toBe(
      avatarGradient("dev@example.com"),
    );
  });

  it("returns a css linear-gradient", () => {
    expect(avatarGradient("someone")).toMatch(/^linear-gradient\(135deg, /);
  });
});

describe("gravatarUrl", () => {
  it("builds a sized url from the md5 of the email with 404 fallback", () => {
    expect(gravatarUrl("dev@example.com", 28)).toBe(
      `https://www.gravatar.com/avatar/${md5("dev@example.com")}?s=56&d=404`,
    );
  });

  it("normalizes (trim + lowercase) the email before hashing", () => {
    expect(gravatarUrl("  Dev@Example.com  ", 20)).toBe(
      gravatarUrl("dev@example.com", 20),
    );
  });

  it("returns null when there is no email", () => {
    expect(gravatarUrl(undefined, 28)).toBeNull();
    expect(gravatarUrl("   ", 28)).toBeNull();
  });
});

describe("hashString", () => {
  it("is non-negative and stable", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).toBeGreaterThanOrEqual(0);
  });
});
