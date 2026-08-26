import { describe, expect, it } from "vitest";
import {
  authBrokerUrl,
  brokerFetchReason,
  brokerStartUrl,
  listBrokerDrivers,
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
