import { apiErrorMessage, HUB_ERROR } from "../api-errors.js";

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

/** Fired after the hub registers a repository from the folder picker. */
export const WORKSPACES_CHANGED = "prism:workspaces";

export function notifyWorkspacesChanged(): void {
  window.dispatchEvent(new Event(WORKSPACES_CHANGED));
}

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

/**
 * A URL another Console tab (or a teammate on the same box) can open straight
 * into this job: swaps in the caller's own token and rebuilds the hash from
 * the job rather than trusting whatever route the current tab happens to be
 * on.
 */
export function consoleJobShareUrl(
  job: { readonly id: string; readonly workspacePath?: string },
  token: string,
  currentHref: string,
): string {
  const url = new URL(currentHref);
  const next = new URLSearchParams();
  if (token) next.set("token", token);
  url.search = next.toString();
  const hash = new URLSearchParams();
  if (job.workspacePath) hash.set("repo", job.workspacePath);
  hash.set("job", job.id);
  url.hash = `/dashboard?${hash.toString()}`;
  return url.toString();
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
    return HUB_ERROR.unauthorized;
  }
  if (status === 400) {
    return "The Console could not tell which repository this belongs to.";
  }
  if (status === 404) {
    return "That repository is not registered.";
  }
  if (status >= 500) {
    return `The Console hit an error answering this (HTTP ${status}).`;
  }
  return `The Console could not answer this request (HTTP ${status}).`;
}

export { apiErrorMessage };

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

const FETCH_MS = 35_000;

async function fetchConsole(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new ConsoleRequestError(0, "The Console took too long to answer.");
    }
    throw new ConsoleRequestError(
      0,
      "Could not reach Prism Dispatch. It may have shut down — run a Prism command to start it again.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(path: string, token: string): Promise<T> {
  const response = await fetchConsole(path, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw new ConsoleRequestError(
      response.status,
      apiErrorMessage(body, explainStatus(response.status)),
    );
  }
  return body as T;
}

export async function patchJson<T>(
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  return sendJson<T>(path, token, body, "PATCH");
}

export async function postJson<T>(
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  return sendJson<T>(path, token, body, "POST");
}

async function sendJson<T>(
  path: string,
  token: string,
  body: unknown,
  method: "POST" | "PATCH",
): Promise<T> {
  const response = await fetchConsole(path, {
    method,
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await readJsonBody(response);
  if (!response.ok) {
    throw new ConsoleRequestError(
      response.status,
      apiErrorMessage(parsed, explainStatus(response.status)),
    );
  }
  return parsed as T;
}
