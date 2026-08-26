import { createHash, randomBytes } from "node:crypto";
import { DriverIdSchema, parseDriverId, type DriverId } from "./types.js";

export { DriverIdSchema, parseDriverId, type DriverId };

/** Local loopback after Prism Auth finishes the vendor grant. */
export const DISPATCH_OAUTH_LOOPBACK_PORT = 8765;
export const DISPATCH_OAUTH_REDIRECT_URI = `http://127.0.0.1:${DISPATCH_OAUTH_LOOPBACK_PORT}/callback`;

export const DEFAULT_AUTH_BROKER_URL = "https://auth.prismhq.in";

export type OAuthProvider = {
  readonly id: DriverId;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly scopes: readonly string[];
  readonly extraAuthorize?: Record<string, string>;
  readonly clientIdEnv: string;
  readonly clientSecretEnv: string;
  /** Broker env names (Vercel). Never shipped in the MCP package. */
  readonly brokerClientIdEnv: string;
  readonly brokerClientSecretEnv: string;
  readonly usePkce: boolean;
  /** Slack user-token flow uses `user_scope` instead of `scope`. */
  readonly userScope?: boolean;
};

export const OAUTH_PROVIDERS: Record<DriverId, OAuthProvider> = {
  github: {
    id: "github",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "repo", "notifications"],
    clientIdEnv: "PRISM_DISPATCH_GITHUB_CLIENT_ID",
    clientSecretEnv: "PRISM_DISPATCH_GITHUB_CLIENT_SECRET",
    brokerClientIdEnv: "PRISM_AUTH_GITHUB_CLIENT_ID",
    brokerClientSecretEnv: "PRISM_AUTH_GITHUB_CLIENT_SECRET",
    usePkce: true,
  },
  linear: {
    id: "linear",
    authorizeUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: ["read"],
    clientIdEnv: "PRISM_DISPATCH_LINEAR_CLIENT_ID",
    clientSecretEnv: "PRISM_DISPATCH_LINEAR_CLIENT_SECRET",
    brokerClientIdEnv: "PRISM_AUTH_LINEAR_CLIENT_ID",
    brokerClientSecretEnv: "PRISM_AUTH_LINEAR_CLIENT_SECRET",
    usePkce: true,
  },
  jira: {
    id: "jira",
    authorizeUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: ["read:jira-work", "read:jira-user", "offline_access"],
    extraAuthorize: {
      audience: "api.atlassian.com",
      prompt: "consent",
    },
    clientIdEnv: "PRISM_DISPATCH_JIRA_CLIENT_ID",
    clientSecretEnv: "PRISM_DISPATCH_JIRA_CLIENT_SECRET",
    brokerClientIdEnv: "PRISM_AUTH_JIRA_CLIENT_ID",
    brokerClientSecretEnv: "PRISM_AUTH_JIRA_CLIENT_SECRET",
    usePkce: true,
  },
  slack: {
    id: "slack",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: [
      "search:read",
      "channels:read",
      "groups:read",
      "channels:history",
      "groups:history",
      "users:read",
    ],
    clientIdEnv: "PRISM_DISPATCH_SLACK_CLIENT_ID",
    clientSecretEnv: "PRISM_DISPATCH_SLACK_CLIENT_SECRET",
    brokerClientIdEnv: "PRISM_AUTH_SLACK_CLIENT_ID",
    brokerClientSecretEnv: "PRISM_AUTH_SLACK_CLIENT_SECRET",
    usePkce: false,
    userScope: true,
  },
  notion: {
    id: "notion",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    extraAuthorize: { owner: "user" },
    clientIdEnv: "PRISM_DISPATCH_NOTION_CLIENT_ID",
    clientSecretEnv: "PRISM_DISPATCH_NOTION_CLIENT_SECRET",
    brokerClientIdEnv: "PRISM_AUTH_NOTION_CLIENT_ID",
    brokerClientSecretEnv: "PRISM_AUTH_NOTION_CLIENT_SECRET",
    usePkce: false,
  },
  "google-calendar": {
    id: "google-calendar",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    extraAuthorize: {
      access_type: "offline",
      prompt: "consent",
    },
    clientIdEnv: "PRISM_DISPATCH_GOOGLE_CLIENT_ID",
    clientSecretEnv: "PRISM_DISPATCH_GOOGLE_CLIENT_SECRET",
    brokerClientIdEnv: "PRISM_AUTH_GOOGLE_CLIENT_ID",
    brokerClientSecretEnv: "PRISM_AUTH_GOOGLE_CLIENT_SECRET",
    usePkce: true,
  },
};

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthorizeUrl(input: {
  readonly provider: OAuthProvider;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly challenge?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    state: input.state,
  });
  if (input.provider.userScope) {
    params.set("user_scope", input.provider.scopes.join(","));
  } else if (input.provider.scopes.length > 0) {
    params.set("scope", input.provider.scopes.join(" "));
  }
  if (input.challenge) {
    params.set("code_challenge", input.challenge);
    params.set("code_challenge_method", "S256");
  }
  for (const [key, value] of Object.entries(
    input.provider.extraAuthorize ?? {},
  )) {
    params.set(key, value);
  }
  return `${input.provider.authorizeUrl}?${params.toString()}`;
}

export type TokenExchange = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  extra?: Record<string, string>;
};

function expiresAtFromOAuth(
  json: Record<string, unknown>,
  now = Date.now(),
): string | undefined {
  const raw = json.expires_in;
  const expiresIn =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return undefined;
  return new Date(now + expiresIn * 1000).toISOString();
}

export function tokenBundleFromOAuthJson(
  json: Record<string, unknown>,
  now = Date.now(),
): TokenExchange {
  const access =
    typeof json.access_token === "string" ? json.access_token : undefined;
  if (!access) throw new Error("OAuth returned no access_token");
  const expiresAt = expiresAtFromOAuth(json, now);
  return {
    accessToken: access,
    ...(typeof json.refresh_token === "string"
      ? { refreshToken: json.refresh_token }
      : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

export async function exchangeCode(input: {
  readonly provider: OAuthProvider;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly redirectUri: string;
  readonly code: string;
  readonly verifier?: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<TokenExchange> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  if (input.clientSecret) body.set("client_secret", input.clientSecret);
  if (input.verifier) body.set("code_verifier", input.verifier);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (input.provider.id === "notion" && input.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`;
  }

  const response = await fetchImpl(input.provider.tokenUrl, {
    method: "POST",
    headers,
    body,
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof json.error_description === "string"
        ? json.error_description
        : `token exchange failed (${response.status})`,
    );
  }

  if (input.provider.id === "slack") {
    const authed = json.authed_user as { access_token?: string } | undefined;
    const token =
      authed?.access_token ??
      (typeof json.access_token === "string" ? json.access_token : undefined);
    if (!token) throw new Error("Slack OAuth returned no user token");
    return { accessToken: token };
  }

  return tokenBundleFromOAuthJson(json);
}

/** Vendor refresh. Client secret stays on Prism Auth (ADR-0036). */
export async function refreshAccessToken(input: {
  readonly provider: OAuthProvider;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly refreshToken: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<TokenExchange> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    refresh_token: input.refreshToken,
  });
  if (input.clientSecret) body.set("client_secret", input.clientSecret);

  const response = await fetchImpl(input.provider.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof json.error_description === "string"
        ? json.error_description
        : `token refresh failed (${response.status})`,
    );
  }
  return tokenBundleFromOAuthJson(json);
}
