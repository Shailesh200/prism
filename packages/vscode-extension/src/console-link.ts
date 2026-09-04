import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { NO_CONSOLE_STATUS, type ConsoleStatus } from "@repo-prism/shared";

/**
 * Where the Prism Console advertises itself.
 *
 * Read as a file rather than through `@repo-prism/dispatch-hub`, deliberately.
 * AGENTS.md keeps Dispatch out of the extension, and this needs three fields
 * from one JSON file — not a package dependency that would pull the whole job
 * runner into the editor process.
 */
function hubRecordPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PRISM_HUB_HOME?.trim();
  return join(override || join(homedir(), ".prism", "hub"), "hub.json");
}

export type ConsoleLink = {
  readonly url: string;
  readonly port: number;
};

type HubRecord = { port?: unknown; token?: unknown };

/**
 * Address-bar hostname. Matches `@repo-prism/dispatch-hub` `consoleHost`,
 * duplicated here so the extension does not import Dispatch (AGENTS.md).
 * RFC 6761 `prismhq.localhost` is the default; `PRISM_CONSOLE_ALIAS=1`
 * speaks the public `local.prismhq.in` name.
 */
function spokenConsoleHost(env: NodeJS.ProcessEnv, override?: string): string {
  if (override?.trim()) return override.trim();
  if (env.PRISM_CONSOLE_HOST?.trim()) return env.PRISM_CONSOLE_HOST.trim();
  if (env.PRISM_CONSOLE_ALIAS === "1") return "local.prismhq.in";
  return "prismhq.localhost";
}

/**
 * Find a running Console, or return undefined.
 *
 * A stale record is worse than none — it opens a browser tab at a dead port —
 * so the port is health-checked before the URL is handed back.
 */
export async function findConsole(
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: typeof fetch;
    /** The hostname to put in the URL. `127.0.0.1` always works. */
    readonly host?: string;
  } = {},
): Promise<ConsoleLink | undefined> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  let record: HubRecord;
  try {
    record = JSON.parse(
      await readFile(hubRecordPath(env), "utf8"),
    ) as HubRecord;
  } catch {
    return undefined;
  }
  const port = typeof record.port === "number" ? record.port : undefined;
  const token = typeof record.token === "string" ? record.token : undefined;
  if (!port || !token) return undefined;

  try {
    const health = await fetchImpl(`http://127.0.0.1:${port}/api/healthz`, {
      signal: AbortSignal.timeout(700),
    });
    if (!health.ok) return undefined;
  } catch {
    return undefined;
  }

  const host = spokenConsoleHost(env, options.host);
  return {
    port,
    url: `http://${host}:${port}/?token=${encodeURIComponent(token)}`,
  };
}

/** What to tell the user when no Console is listening. */
/**
 * The Console, its version, and what the agent window has connected.
 *
 * Over HTTP rather than by importing `@repo-prism/dispatch`, which keeps the
 * extension free of Dispatch: discovery, job state and the connector walk all
 * live behind one local port that is already running (ADR-0048, ADR-0049).
 * Every failure answers "no Console", because from the Integrations screen's
 * point of view a Console that will not talk is a Console that is not there.
 */
export async function fetchConsoleStatus(
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: typeof fetch;
    readonly host?: string;
  } = {},
): Promise<ConsoleStatus> {
  const link = await findConsole(options);
  if (!link) return NO_CONSOLE_STATUS;

  const fetchImpl = options.fetchImpl ?? fetch;
  const token = new URL(link.url).searchParams.get("token") ?? "";
  const base = `http://127.0.0.1:${link.port}`;
  const get = async (path: string): Promise<Record<string, unknown>> => {
    const res = await fetchImpl(
      `${base}${path}?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Record<string, unknown>;
  };

  // Health is what makes the card say "connected"; connectors are what make
  // it useful. Settled separately so a discovery walk that trips on an
  // unreadable manifest does not also blank the version.
  const [health, connectors] = await Promise.allSettled([
    get("/api/healthz"),
    get("/api/connectors"),
  ]);

  const body = connectors.status === "fulfilled" ? connectors.value : {};
  return {
    console: { url: link.url, port: link.port },
    ...(health.status === "fulfilled" &&
    typeof health.value.version === "string"
      ? { version: health.value.version }
      : {}),
    ...(health.status === "fulfilled" &&
    typeof health.value.workspaces === "number"
      ? { workspaces: health.value.workspaces }
      : {}),
    connectors: Array.isArray(body.connectors)
      ? (body.connectors as ConsoleStatus["connectors"])
      : [],
    unreadable: Array.isArray(body.unreadable)
      ? (body.unreadable as ConsoleStatus["unreadable"])
      : [],
  };
}

export const NO_CONSOLE_MESSAGE =
  "Prism: the Prism Console is not running. Ask Prism in chat to start it (any Prism tool will), then try again.";
