import { describe, expect, it } from "vitest";
import { isDriverAuthFailure, tokenNeedsRefresh } from "./token-refresh.js";

describe("tokenNeedsRefresh", () => {
  it("is false without a refresh token", () => {
    expect(
      tokenNeedsRefresh({
        accessToken: "a",
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("is true when expiry is within the skew window", () => {
    expect(
      tokenNeedsRefresh(
        {
          accessToken: "a",
          refreshToken: "r",
          expiresAt: "2026-08-26T18:01:00.000Z",
        },
        Date.parse("2026-08-26T18:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("is false when expiry is still well in the future", () => {
    expect(
      tokenNeedsRefresh(
        {
          accessToken: "a",
          refreshToken: "r",
          expiresAt: "2026-08-26T19:00:00.000Z",
        },
        Date.parse("2026-08-26T18:00:00.000Z"),
      ),
    ).toBe(false);
  });
});

describe("isDriverAuthFailure", () => {
  it("matches Calendar 401 copy", () => {
    expect(
      isDriverAuthFailure(
        "Calendar access expired. Say “connect Google Calendar” to sign in again.",
      ),
    ).toBe(true);
  });
});
