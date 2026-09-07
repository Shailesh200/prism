import { describe, expect, it } from "vitest";
import { GITHUB, formatStarCount, parseStarCount } from "./github";

describe("github star helpers", () => {
  it("points at the public repo", () => {
    expect(GITHUB).toBe("https://github.com/Shailesh200/prism");
  });

  it("parses a public API payload", () => {
    expect(parseStarCount({ stargazers_count: 42 })).toBe(42);
    expect(parseStarCount({ stargazers_count: -1 })).toBeNull();
    expect(parseStarCount({})).toBeNull();
  });

  it("formats compact counts", () => {
    expect(formatStarCount(12)).toBe("12");
    expect(formatStarCount(1500)).toBe("1.5k");
  });
});
