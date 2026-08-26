import {
  buildAuthorizeUrl,
  createPkce,
  DISPATCH_OAUTH_REDIRECT_URI,
  DriverIdSchema,
  exchangeCode,
  OAUTH_PROVIDERS,
  parseDriverId,
  refreshAccessToken,
  type DriverId,
  type TokenExchange,
} from "@repo-prism/dispatch/oauth-providers";
import { openJson, PICKUP_TTL_MS, sealJson, SESSION_TTL_MS } from "./seal.js";

export const DEFAULT_PUBLIC_ORIGIN = "https://auth.prismhq.in";

export type AuthConfig = {
  readonly publicOrigin: string;
  readonly sessionSecret: string;
  readonly env: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly loopbackRedirectUri?: string;
};

type SealedSession = {
  t: "s";
  d: DriverId;
  c: string;
  p?: string;
  e: number;
};

type SealedPickup = {
  t: "p";
  d: DriverId;
  a: string;
  r?: string;
  x?: string;
  extra?: Record<string, string>;
  e: number;
};

export function configFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const publicOrigin = (
    env.PRISM_AUTH_PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN
  ).replace(/\/$/, "");
  const sessionSecret = env.PRISM_AUTH_SESSION_SECRET?.trim() ?? "";
  return { publicOrigin, sessionSecret, env };
}

export function vendorCallbackUri(config: AuthConfig): string {
  return `${config.publicOrigin}/oauth/callback`;
}

function html(status: number, title: string, body: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><p>${escapeHtml(body)}</p></body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function json(status: number, payload: unknown): Response {
  return new Response(`${JSON.stringify(payload)}\n`, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function brokerCredentials(
  driver: DriverId,
  env: NodeJS.ProcessEnv,
): { clientId: string; clientSecret?: string } | undefined {
  const provider = OAUTH_PROVIDERS[driver];
  const clientId = env[provider.brokerClientIdEnv]?.trim();
  if (!clientId) return undefined;
  const clientSecret = env[provider.brokerClientSecretEnv]?.trim();
  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
  };
}

export function enabledDrivers(env: NodeJS.ProcessEnv): DriverId[] {
  return DriverIdSchema.options.filter(
    (id) => brokerCredentials(id, env) !== undefined,
  );
}

export async function handleOAuthDrivers(
  _request: Request,
  config: AuthConfig,
): Promise<Response> {
  const drivers = DriverIdSchema.options.map((id) => ({
    id,
    enabled: brokerCredentials(id, config.env) !== undefined,
  }));
  return json(200, { drivers, callback: vendorCallbackUri(config) });
}

export async function handleOAuthStart(
  request: Request,
  config: AuthConfig,
): Promise<Response> {
  if (!config.sessionSecret) {
    return html(
      503,
      "Prism Auth",
      "Prism Auth is not configured (missing session secret).",
    );
  }
  const url = new URL(request.url);
  const driver = parseDriverId(url.searchParams.get("driver"));
  const clientState = url.searchParams.get("state")?.trim() ?? "";
  if (!driver || !clientState) {
    return html(
      400,
      "Prism Auth",
      "start needs a Dispatch driver and a state parameter.",
    );
  }
  const credentials = brokerCredentials(driver, config.env);
  if (!credentials) {
    return html(
      503,
      "Prism Auth",
      `${driver} is not enabled on Prism Auth yet.`,
    );
  }
  const provider = OAUTH_PROVIDERS[driver];
  const now = config.now ?? Date.now;
  const pkce = provider.usePkce ? createPkce() : undefined;
  const sealed: SealedSession = {
    t: "s",
    d: driver,
    c: clientState,
    e: now() + SESSION_TTL_MS,
    ...(pkce ? { p: pkce.verifier } : {}),
  };
  const authorizeUrl = buildAuthorizeUrl({
    provider,
    clientId: credentials.clientId,
    redirectUri: vendorCallbackUri(config),
    state: sealJson(config.sessionSecret, sealed),
    ...(pkce ? { challenge: pkce.challenge } : {}),
  });
  return Response.redirect(authorizeUrl, 302);
}

export async function handleOAuthCallback(
  request: Request,
  config: AuthConfig,
): Promise<Response> {
  if (!config.sessionSecret) {
    return html(
      503,
      "Prism Auth",
      "Prism Auth is not configured (missing session secret).",
    );
  }
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return html(400, "Prism Auth", `Vendor OAuth error: ${error}`);
  }
  const code = url.searchParams.get("code")?.trim();
  const sealedState = url.searchParams.get("state")?.trim();
  if (!code || !sealedState) {
    return html(400, "Prism Auth", "Missing OAuth code or state.");
  }
  let session: SealedSession;
  try {
    session = openJson<SealedSession>(config.sessionSecret, sealedState);
  } catch {
    return html(400, "Prism Auth", "Invalid OAuth state.");
  }
  const now = config.now ?? Date.now;
  if (session.t !== "s" || session.e < now()) {
    return html(400, "Prism Auth", "OAuth state expired. Try connect again.");
  }
  const credentials = brokerCredentials(session.d, config.env);
  if (!credentials) {
    return html(503, "Prism Auth", `${session.d} is not enabled.`);
  }
  const provider = OAUTH_PROVIDERS[session.d];
  let bundle: TokenExchange;
  try {
    bundle = await exchangeCode({
      provider,
      clientId: credentials.clientId,
      ...(credentials.clientSecret
        ? { clientSecret: credentials.clientSecret }
        : {}),
      redirectUri: vendorCallbackUri(config),
      code,
      ...(session.p ? { verifier: session.p } : {}),
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return html(502, "Prism Auth", `Token exchange failed: ${detail}`);
  }
  const pickup: SealedPickup = {
    t: "p",
    d: session.d,
    a: bundle.accessToken,
    e: now() + PICKUP_TTL_MS,
    ...(bundle.refreshToken ? { r: bundle.refreshToken } : {}),
    ...(bundle.expiresAt ? { x: bundle.expiresAt } : {}),
    ...(bundle.extra ? { extra: bundle.extra } : {}),
  };
  const loopback = new URL(
    config.loopbackRedirectUri ?? DISPATCH_OAUTH_REDIRECT_URI,
  );
  loopback.searchParams.set("code", sealJson(config.sessionSecret, pickup));
  loopback.searchParams.set("state", session.c);
  return Response.redirect(loopback.toString(), 302);
}

export async function handleOAuthRedeem(
  request: Request,
  config: AuthConfig,
): Promise<Response> {
  if (!config.sessionSecret) {
    return json(503, { message: "Prism Auth is not configured." });
  }
  if (request.method !== "POST") {
    return json(405, { message: "POST a pickup code." });
  }
  let pickupToken: string | undefined;
  try {
    const body = (await request.json()) as { code?: unknown };
    pickupToken = typeof body.code === "string" ? body.code.trim() : undefined;
  } catch {
    return json(400, { message: "Expected JSON { code }." });
  }
  if (!pickupToken) return json(400, { message: "Missing pickup code." });
  let pickup: SealedPickup;
  try {
    pickup = openJson<SealedPickup>(config.sessionSecret, pickupToken);
  } catch {
    return json(400, { message: "Invalid pickup code." });
  }
  const now = config.now ?? Date.now;
  if (pickup.t !== "p" || pickup.e < now()) {
    return json(400, { message: "Pickup expired. Connect again." });
  }
  return json(200, {
    driver: pickup.d,
    accessToken: pickup.a,
    ...(pickup.r ? { refreshToken: pickup.r } : {}),
    ...(pickup.x ? { expiresAt: pickup.x } : {}),
    ...(pickup.extra ? { extra: pickup.extra } : {}),
  });
}

export async function handleOAuthRefresh(
  request: Request,
  config: AuthConfig,
): Promise<Response> {
  if (!config.sessionSecret) {
    return json(503, { message: "Prism Auth is not configured." });
  }
  if (request.method !== "POST") {
    return json(405, { message: "POST { driver, refreshToken }." });
  }
  let driverRaw: unknown;
  let refreshToken: string | undefined;
  try {
    const body = (await request.json()) as {
      driver?: unknown;
      refreshToken?: unknown;
    };
    driverRaw = body.driver;
    refreshToken =
      typeof body.refreshToken === "string"
        ? body.refreshToken.trim()
        : undefined;
  } catch {
    return json(400, { message: "Expected JSON { driver, refreshToken }." });
  }
  const driver = parseDriverId(
    typeof driverRaw === "string" ? driverRaw : null,
  );
  if (!driver || !refreshToken) {
    return json(400, { message: "refresh needs a driver and refreshToken." });
  }
  const credentials = brokerCredentials(driver, config.env);
  if (!credentials) {
    return json(503, {
      message: `${driver} is not enabled on Prism Auth yet.`,
    });
  }
  try {
    const bundle = await refreshAccessToken({
      provider: OAUTH_PROVIDERS[driver],
      clientId: credentials.clientId,
      ...(credentials.clientSecret
        ? { clientSecret: credentials.clientSecret }
        : {}),
      refreshToken,
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    });
    return json(200, {
      driver,
      accessToken: bundle.accessToken,
      ...(bundle.refreshToken ? { refreshToken: bundle.refreshToken } : {}),
      ...(bundle.expiresAt ? { expiresAt: bundle.expiresAt } : {}),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return json(401, { message: detail });
  }
}
