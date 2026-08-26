import { authBrokerUrl, refreshBrokerToken } from "./broker.js";
import { saveToken, type TokenBundle } from "./tokens.js";
import type { DriverId } from "./types.js";

const REFRESH_SKEW_MS = 120_000;

export function tokenNeedsRefresh(
  token: TokenBundle,
  now = Date.now(),
): boolean {
  if (!token.refreshToken?.trim()) return false;
  if (!token.expiresAt) return false;
  const expires = Date.parse(token.expiresAt);
  if (!Number.isFinite(expires)) return false;
  return expires <= now + REFRESH_SKEW_MS;
}

export function isDriverAuthFailure(error: string | undefined): boolean {
  if (!error) return false;
  return /\b401\b|\b403\b|invalid_auth|unauthorized|invalid token|access expired/i.test(
    error,
  );
}

export async function renewDriverToken(input: {
  readonly workspaceRoot: string;
  readonly driver: DriverId;
  readonly token: TokenBundle;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
}): Promise<TokenBundle | undefined> {
  const refresh = input.token.refreshToken?.trim();
  if (!refresh) return undefined;
  try {
    const next = await refreshBrokerToken(
      authBrokerUrl(input.env),
      input.driver,
      refresh,
      input.fetchImpl ?? fetch,
    );
    const refreshToken = next.refreshToken ?? input.token.refreshToken;
    const expiresAt = next.expiresAt ?? input.token.expiresAt;
    const extra = next.extra ?? input.token.extra;
    const bundle: TokenBundle = {
      accessToken: next.accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(extra ? { extra } : {}),
    };
    await saveToken(input.workspaceRoot, input.driver, bundle);
    return bundle;
  } catch {
    return undefined;
  }
}
