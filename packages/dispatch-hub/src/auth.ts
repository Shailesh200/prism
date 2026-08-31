import type { IncomingMessage } from "node:http";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return LOOPBACK.has(url.hostname);
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
