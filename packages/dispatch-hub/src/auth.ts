import type { IncomingMessage } from "node:http";
import { CONSOLE_ALIAS_HOST } from "./paths.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * The Origin allowlist is the defence against DNS rebinding (ADR-0048): a
 * hostile page cannot be stopped from *resolving* a name to 127.0.0.1, so what
 * stops it reading the Console is that its own origin is not on this list. The
 * token is checked separately and always.
 */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (LOOPBACK.has(url.hostname)) return true;
    // RFC 6761 reserves `.localhost`, and every current browser resolves it to
    // loopback without a DNS lookup. `prismhq.localhost` and any other label
    // under it can only ever reach this machine.
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
      return true;
    }
    // Opt-in branded name. Accepted by exact hostname so a bookmark still
    // works if someone later sets PRISM_CONSOLE_ALIAS=1.
    return url.hostname === CONSOLE_ALIAS_HOST;
  } catch {
    return false;
  }
}

export function tokenFromRequest(
  req: IncomingMessage,
  url: URL,
): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const bearer = header.slice("Bearer ".length).trim();
    if (bearer) return bearer;
  }
  const query = url.searchParams.get("token")?.trim();
  if (query) return query;
  const cookie = req.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "prism_hub") {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

export function tokensMatch(
  expected: string,
  given: string | undefined,
): boolean {
  return Boolean(given) && given === expected;
}

export const HUB_COOKIE = "prism_hub";

export function hubCookieHeader(token: string): string {
  return `${HUB_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}
