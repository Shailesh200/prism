/**
 * How the browser app talks to the Console (ADR-0048).
 *
 * The token arrives once in the query string. It is stored in `localStorage`
 * (and mirrored in `sessionStorage`) so a reload, a second tab, or an in-app
 * navigation does not need it back in the URL. The hub also sets an HttpOnly
 * cookie on a successful page load; fetch sends that cookie for same-origin
 * calls when the stored token is missing.
 */
const TOKEN_KEY = "prism-hub-token";

function writeStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function readToken(): string {
  const query = new URLSearchParams(window.location.search).get("token");
  if (query) {
    writeStoredToken(query);
    return query;
  }
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A failed request the UI can explain rather than just colour red. */
export class ConsoleRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ConsoleRequestError";
    this.status = status;
  }
}

export function explainStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "This page needs a Prism session. Reopen the Console from Prism to get a fresh token.";
  }
  if (status === 400) {
    return "The Console could not tell which repository this belongs to.";
  }
  if (status >= 500) {
    return `The Console hit an error answering this (HTTP ${status}).`;
  }
  return `The Console could not answer this request (HTTP ${status}).`;
}

export async function getJson<T>(path: string, token: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { headers: authHeaders(token) });
  } catch {
    // A dead daemon and a rejected request are different problems with
    // different fixes, so they must not share one message.
    throw new ConsoleRequestError(
      0,
      "Could not reach Prism Dispatch. It may have shut down — run a Prism command to start it again.",
    );
  }
  if (!response.ok) {
    throw new ConsoleRequestError(
      response.status,
      explainStatus(response.status),
    );
  }
  return (await response.json()) as T;
}

export async function postJson<T>(
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ConsoleRequestError(
      response.status,
      explainStatus(response.status),
    );
  }
  return (await response.json()) as T;
}
