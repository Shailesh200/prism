import { describe, expect, it } from "vitest";
import {
  configFromEnv,
  handleOAuthCallback,
  handleOAuthDrivers,
  handleOAuthRedeem,
  handleOAuthRefresh,
  handleOAuthStart,
  vendorCallbackUri,
} from "./handlers.js";

const secret = "test-session-secret-test-session-secret";

function authConfig(fetchImpl?: typeof fetch) {
  return {
    publicOrigin: "https://auth.prismhq.in",
    sessionSecret: secret,
    env: {
      PRISM_AUTH_GOOGLE_CLIENT_ID: "google-client",
      PRISM_AUTH_GOOGLE_CLIENT_SECRET: "google-secret",
    },
    ...(fetchImpl ? { fetchImpl } : {}),
  };
}

describe("Prism Auth broker", () => {
  it("lists enabled drivers without exposing secrets", async () => {
    const response = await handleOAuthDrivers(
      new Request("https://auth.prismhq.in/oauth/drivers"),
      authConfig(),
    );
    const body = (await response.json()) as {
      drivers: { id: string; enabled: boolean }[];
      callback: string;
    };
    expect(body.callback).toBe("https://auth.prismhq.in/oauth/callback");
    expect(
      body.drivers.find((row) => row.id === "google-calendar")?.enabled,
    ).toBe(true);
    expect(body.drivers.find((row) => row.id === "slack")?.enabled).toBe(false);
    expect(JSON.stringify(body)).not.toContain("google-secret");
  });

  it("redirects start to the vendor with Prism's callback URI", async () => {
    const response = await handleOAuthStart(
      new Request(
        "https://auth.prismhq.in/oauth/start?driver=google-calendar&state=client-state",
      ),
      authConfig(),
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe("google-client");
    expect(location.searchParams.get("redirect_uri")).toBe(
      vendorCallbackUri(authConfig()),
    );
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("exchanges the vendor code and returns a redeemable pickup to loopback", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = String(init?.body ?? "");
      expect(body).toContain("code=vendor-code");
      expect(body).toContain("client_secret=google-secret");
      expect(body).toContain(
        "redirect_uri=https%3A%2F%2Fauth.prismhq.in%2Foauth%2Fcallback",
      );
      return new Response(
        JSON.stringify({
          access_token: "ya29.local",
          refresh_token: "refresh",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const start = await handleOAuthStart(
      new Request(
        "https://auth.prismhq.in/oauth/start?driver=google-calendar&state=client-state",
      ),
      authConfig(fetchImpl),
    );
    const vendorState = new URL(
      start.headers.get("location") ?? "",
    ).searchParams.get("state");
    const callback = await handleOAuthCallback(
      new Request(
        `https://auth.prismhq.in/oauth/callback?code=vendor-code&state=${vendorState}`,
      ),
      authConfig(fetchImpl),
    );
    expect(callback.status).toBe(302);
    const loopback = new URL(callback.headers.get("location") ?? "");
    expect(loopback.hostname).toBe("127.0.0.1");
    expect(loopback.port).toBe("8765");
    expect(loopback.searchParams.get("state")).toBe("client-state");
    const pickup = loopback.searchParams.get("code") ?? "";
    const redeemed = await handleOAuthRedeem(
      new Request("https://auth.prismhq.in/oauth/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pickup }),
      }),
      authConfig(fetchImpl),
    );
    expect(redeemed.status).toBe(200);
    const tokens = (await redeemed.json()) as {
      accessToken: string;
      refreshToken?: string;
    };
    expect(tokens.accessToken).toBe("ya29.local");
    expect(tokens.refreshToken).toBe("refresh");
  });

  it("refreshes a Google access token with the broker secret", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = String(init?.body ?? "");
      expect(body).toContain("grant_type=refresh_token");
      expect(body).toContain("refresh_token=refresh");
      expect(body).toContain("client_secret=google-secret");
      return new Response(
        JSON.stringify({
          access_token: "ya29.fresh",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const response = await handleOAuthRefresh(
      new Request("https://auth.prismhq.in/oauth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver: "google-calendar",
          refreshToken: "refresh",
        }),
      }),
      authConfig(fetchImpl),
    );
    expect(response.status).toBe(200);
    const tokens = (await response.json()) as {
      accessToken: string;
      expiresAt?: string;
    };
    expect(tokens.accessToken).toBe("ya29.fresh");
    expect(tokens.expiresAt).toBeTruthy();
  });

  it("does not start OAuth when the broker has no client for that driver", async () => {
    const response = await handleOAuthStart(
      new Request(
        "https://auth.prismhq.in/oauth/start?driver=slack&state=client-state",
      ),
      authConfig(),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toMatch(/not enabled/i);
  });

  it("reads public origin from env", () => {
    const config = configFromEnv({
      PRISM_AUTH_PUBLIC_ORIGIN: "https://auth.example.test/",
      PRISM_AUTH_SESSION_SECRET: secret,
    });
    expect(config.publicOrigin).toBe("https://auth.example.test");
    expect(vendorCallbackUri(config)).toBe(
      "https://auth.example.test/oauth/callback",
    );
  });
});
