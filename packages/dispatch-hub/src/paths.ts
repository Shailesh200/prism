import { homedir } from "node:os";
import { join } from "node:path";

/** Loopback-only port for the jobs dashboard (ADR-0043). */
export const HUB_PORT = 17330;

export const HUB_DIR_NAME = ".prism/hub";

export type HubEnv = {
  readonly PRISM_HUB?: string;
  readonly PRISM_HUB_HOME?: string;
  readonly PRISM_HUB_PORT?: string;
  /** `1` speaks `local.prismhq.in` instead of `prismhq.localhost`. */
  readonly PRISM_CONSOLE_ALIAS?: string;
  /** An explicit hostname for the dashboard URL, overriding the default. */
  readonly PRISM_CONSOLE_HOST?: string;
  readonly VITEST?: string;
  readonly [key: string]: string | undefined;
};

/**
 * Overlay hub overrides on `process.env`.
 *
 * Tests pass a sparse object (`PRISM_HUB_HOME`, `PRISM_HUB_PORT`). If that
 * replaced the process env, `VITEST` vanished and the job store treated the
 * developer's real `~/.prism` as live (ADR-0054). A shell `PRISM_HOME` is
 * blanked in Vitest unless the overlay set one, so fixtures stay local.
 */
export function mergeHubEnv(env?: HubEnv): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (process.env.VITEST === "true" && !env?.PRISM_HOME?.trim()) {
    merged.VITEST = "true";
    merged.PRISM_HOME = "";
  }
  return merged;
}

export function hubHome(env: HubEnv = process.env): string {
  const override = env.PRISM_HUB_HOME?.trim();
  if (override) return override;
  return join(homedir(), ".prism", "hub");
}

export function hubRecordPath(home = hubHome()): string {
  return join(home, "hub.json");
}

export function hubRegistryPath(home = hubHome()): string {
  return join(home, "registry.json");
}

export function hubPort(env: HubEnv = process.env): number {
  const raw = env.PRISM_HUB_PORT?.trim();
  if (raw === "0") return 0;
  const parsed = raw ? Number.parseInt(raw, 10) : HUB_PORT;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : HUB_PORT;
}

export function hubEnabled(env: HubEnv = process.env): boolean {
  if (env.PRISM_HUB === "0") return false;
  // Vitest sets VITEST=true. Do not spawn a user-level daemon from the suite
  // unless a test opts in with PRISM_HUB=1.
  if (env.VITEST === "true" && env.PRISM_HUB !== "1") return false;
  return true;
}

/**
 * The address bar name (ADR-0048).
 *
 * `prismhq.localhost` is the default. RFC 6761 reserves `.localhost`, so
 * browsers resolve it to loopback with no DNS, hosts file, or sudo. The
 * daemon still binds `127.0.0.1:17330`. `local.prismhq.in` stays an opt-in
 * (`PRISM_CONSOLE_ALIAS=1`) exact-name alias — never a `*.prismhq.in` suffix.
 */
export const CONSOLE_HOST = "prismhq.localhost";

/** Branded loopback alias. Exact name only — never a `*.prismhq.in` suffix. */
export const CONSOLE_ALIAS_HOST = "local.prismhq.in";

export function consoleHost(env: HubEnv = process.env): string {
  if (env.PRISM_CONSOLE_HOST?.trim()) return env.PRISM_CONSOLE_HOST.trim();
  if (env.PRISM_CONSOLE_ALIAS === "1") return CONSOLE_ALIAS_HOST;
  return CONSOLE_HOST;
}

export function dashboardUrl(
  port: number,
  token?: string,
  env: HubEnv = process.env,
): string {
  const base = `http://${consoleHost(env)}:${port}/`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

/**
 * The address the daemon binds and that health checks dial.
 *
 * Deliberately still the literal loopback IP: a name is a nicety for the
 * address bar, but `ensureHub` polling a name it cannot resolve would turn a
 * cosmetic feature into a broken dispatch.
 */
export function hubOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}
