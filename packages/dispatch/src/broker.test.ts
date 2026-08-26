import { describe, expect, it } from "vitest";
import { authBrokerUrl, brokerStartUrl } from "./broker.js";

describe("Prism Auth client", () => {
  it("defaults to auth.prismhq.in", () => {
    expect(authBrokerUrl({})).toBe("https://auth.prismhq.in");
  });

  it("builds the start URL the browser should open", () => {
    expect(
      brokerStartUrl("https://auth.prismhq.in", "google-calendar", "abc"),
    ).toBe(
      "https://auth.prismhq.in/oauth/start?driver=google-calendar&state=abc",
    );
  });
});
