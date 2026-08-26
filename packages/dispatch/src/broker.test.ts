import { describe, expect, it } from "vitest";
import {
  authBrokerUrl,
  brokerFetchReason,
  brokerStartUrl,
  listBrokerDrivers,
  refreshBrokerToken,
} from "./broker.js";

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

  it("records TLS failures instead of a silent unreachable", async () => {
    const catalog = await listBrokerDrivers(
      "https://auth.prismhq.in",
      async () => {
        throw new Error("self-signed certificate in certificate chain");
      },
    );
    expect(catalog.reachable).toBe(false);
    expect(catalog.reason).toMatch(/self-signed certificate/i);
    expect(catalog.reason).toMatch(/OS certificate store/i);
  });

  it("records HTTP failures from Prism Auth", async () => {
    const catalog = await listBrokerDrivers(
      "https://auth.prismhq.in",
      async () => new Response("nope", { status: 503 }),
    );
    expect(catalog.reachable).toBe(false);
    expect(catalog.reason).toBe("HTTP 503");
  });

  it("posts a refresh token to Prism Auth", async () => {
    const bundle = await refreshBrokerToken(
      "https://auth.prismhq.in",
      "google-calendar",
      "refresh-me",
      async (input, init) => {
        expect(String(input)).toBe("https://auth.prismhq.in/oauth/refresh");
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            accessToken: "fresh",
            refreshToken: "rotated",
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    expect(bundle.accessToken).toBe("fresh");
    expect(bundle.refreshToken).toBe("rotated");
  });
});

describe("brokerFetchReason", () => {
  it("flags corporate TLS intercept", () => {
    expect(
      brokerFetchReason(
        new Error("self-signed certificate in certificate chain"),
      ),
    ).toMatch(/corporate TLS intercept/i);
  });
});
