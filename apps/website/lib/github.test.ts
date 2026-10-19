import { describe, expect, it } from "vitest";
import {
  GITHUB,
  fetchStarCount,
  formatStarCount,
  parseStarCount,
} from "./github";

const reply = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status });

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
    expect(formatStarCount(1000)).toBe("1k");
    expect(formatStarCount(12_345)).toBe("12.3k");
    expect(formatStarCount(1_200_000)).toBe("1.2m");
  });

  it("gives null when the count can't be read", async () => {
    expect(await fetchStarCount(reply(200, { stargazers_count: 7 }))).toBe(7);
    expect(
      await fetchStarCount(reply(404, { message: "Not Found" })),
    ).toBeNull();
    expect(
      await fetchStarCount(reply(403, { message: "rate limit" })),
    ).toBeNull();
    expect(
      await fetchStarCount(reply(200, { private: true, stargazers_count: 3 })),
    ).toBeNull();
    expect(
      await fetchStarCount(async () => {
        throw new TypeError("offline");
      }),
    ).toBeNull();
  });
});
