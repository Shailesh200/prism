/**
 * Same-origin `/api/*` on the Dashboard; hub origin in the IDE webview.
 */

let configuredBase = "";

export function configureHubApi(base: string): void {
  configuredBase = base.replace(/\/$/, "");
}

export function resolveHubUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const onHttpDashboard =
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" ||
      window.location.protocol === "https:");
  const base = onHttpDashboard ? "" : configuredBase;
  return `${base}${path}`;
}

export function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function readToken(): string {
  try {
    return new URL(window.location.href).searchParams.get("token") ?? "";
  } catch {
    return "";
  }
}

export const WORKSPACES_CHANGED = "prism:workspaces";

export function notifyWorkspacesChanged(): void {
  window.dispatchEvent(new Event(WORKSPACES_CHANGED));
}

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
  url.hash = `/jobs?${hash.toString()}`;
  return url.toString();
}

export class ConsoleRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ConsoleRequestError";
    this.status = status;
  }
}

/** Never tell someone on this page that the Dashboard is not running. */
export function explainIrisError(message: string): string {
  if (
    /fetch failed|Failed to fetch|ECONNREFUSED|not running|asleep/i.test(
      message,
    )
  ) {
    return "Could not load this data. Refresh the page, or pick the repository again.";
  }
  return message;
}

export function explainStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "This page needs a Prism session. Reopen the Dashboard from Prism to get a fresh token.";
  }
  if (status === 400) {
    return "Prism could not tell which repository this belongs to.";
  }
  if (status === 404) {
    return "That repository is not registered.";
  }
  if (status >= 500) {
    return `Prism hit an error answering this (HTTP ${status}).`;
  }
  return `Prism could not answer this request (HTTP ${status}).`;
}

function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const row = body as Record<string, unknown>;
  for (const key of ["error", "message", "detail"]) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text) continue;
    if (!/\s/.test(text) && text === text.toLowerCase()) continue;
    return text;
  }
  return fallback;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

const FETCH_MS = 35_000;

async function fetchHub(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    return await fetch(resolveHubUrl(input), {
      ...init,
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ConsoleRequestError(0, "Prism took too long to answer.");
    }
    throw new ConsoleRequestError(
      0,
      "Could not reach Prism. It may have shut down — run a Prism command to start it again.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(path: string, token: string): Promise<T> {
  const response = await fetchHub(path, {
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
  const response = await fetchHub(path, {
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
