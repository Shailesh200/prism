import { homedir } from "node:os";
import { join } from "node:path";

/** Loopback-only port for the jobs dashboard (ADR-0043). */
export const HUB_PORT = 17330;

export const HUB_DIR_NAME = ".prism/hub";

export type HubEnv = {
  readonly PRISM_HUB?: string;
  readonly PRISM_HUB_HOME?: string;
  readonly PRISM_HUB_PORT?: string;
  readonly VITEST?: string;
  readonly [key: string]: string | undefined;
};

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

export function dashboardUrl(port: number, token?: string): string {
  const base = `http://127.0.0.1:${port}/`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
