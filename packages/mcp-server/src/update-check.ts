/**
 * Update notice (plan §2.3). A background check, cached for 24 h in
 * `~/.prism/update.json`. It never blocks startup, never re-launches the
 * server and never installs anything: it only reports
 * "update available: run `prism upgrade`".
 *
 * A local checkout (the development build) is never checked: it is not an
 * installed release, so "newer on npm" means nothing for it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { prismHomeDir } from "@repo-prism/shared/prism-home";

const REGISTRY_URL = "https://registry.npmjs.org/@prismapp/mcp-server/latest";
const FETCH_MS = 2000;
export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

type Semver = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
};

const SEMVER =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(raw: string): Semver | undefined {
  const match = SEMVER.exec(raw.trim());
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver 2.0.0 precedence: negative when a < b, 0 when equal, positive when a > b. */
export function compareSemver(a: Semver, b: Semver): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  const n = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < n; i++) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const cmp = compareIdentifiers(left, right);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  return compareSemver(a, b) > 0;
}

/** A checkout (development build), as opposed to an installed package. */
export function isLocalCheckout(entry: string | undefined): boolean {
  if (!entry) return false;
  const normalized = entry.replaceAll("\\", "/");
  if (normalized.includes("/node_modules/")) return false;
  return (
    normalized.includes("/packages/mcp-server/") ||
    normalized.endsWith("/src/bin.ts")
  );
}

export type UpdateCache = {
  readonly checkedAt: string;
  readonly latest: string;
};

export function updateCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHomeDir(env), "update.json");
}

export type UpdateCheckOutcome =
  | { readonly kind: "skipped"; readonly reason: "local-checkout" | "disabled" }
  | {
      readonly kind: "current";
      readonly latest: string;
      readonly cached: boolean;
    }
  | {
      readonly kind: "available";
      readonly latest: string;
      readonly cached: boolean;
    }
  | { readonly kind: "unknown"; readonly reason: string };

export type UpdateCheckInput = {
  readonly currentVersion: string;
  readonly env: NodeJS.ProcessEnv;
  readonly entry?: string;
  readonly now?: () => number;
  readonly fetchImpl?: typeof fetch;
};

async function readCache(path: string): Promise<UpdateCache | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
  const parsed = JSON.parse(raw) as Partial<UpdateCache>;
  if (
    typeof parsed.checkedAt !== "string" ||
    typeof parsed.latest !== "string"
  ) {
    return undefined;
  }
  return { checkedAt: parsed.checkedAt, latest: parsed.latest };
}

async function fetchLatest(fetchImpl: typeof fetch): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`registry answered ${response.status}`);
    const body = (await response.json()) as { version?: unknown };
    if (typeof body.version !== "string") {
      throw new Error("registry answer has no version");
    }
    return body.version;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decide whether a newer release exists. Uses the cached answer when it is
 * younger than 24 h. Errors are returned as `unknown` with the reason, never
 * thrown, so the caller can log them.
 */
export async function checkForUpdate(
  input: UpdateCheckInput,
): Promise<UpdateCheckOutcome> {
  if (input.env.PRISM_SKIP_SELF_UPDATE === "1") {
    return { kind: "skipped", reason: "disabled" };
  }
  if (isLocalCheckout(input.entry)) {
    return { kind: "skipped", reason: "local-checkout" };
  }
  const now = input.now ?? Date.now;
  const path = updateCachePath(input.env);
  const verdict = (latest: string, cached: boolean): UpdateCheckOutcome =>
    isNewerVersion(latest, input.currentVersion)
      ? { kind: "available", latest, cached }
      : { kind: "current", latest, cached };
  try {
    const cache = await readCache(path);
    if (cache && now() - Date.parse(cache.checkedAt) < UPDATE_CHECK_TTL_MS) {
      return verdict(cache.latest, true);
    }
    const latest = await fetchLatest(input.fetchImpl ?? fetch);
    await mkdir(dirname(path), { recursive: true });
    const record: UpdateCache = {
      checkedAt: new Date(now()).toISOString(),
      latest,
    };
    await writeFile(path, `${JSON.stringify(record)}\n`, "utf8");
    return verdict(latest, false);
  } catch (cause) {
    return {
      kind: "unknown",
      reason: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export function updateNotice(outcome: UpdateCheckOutcome): string | undefined {
  return outcome.kind === "available"
    ? `prism-mcp: update available (${outcome.latest}): run \`prism upgrade\`\n`
    : undefined;
}
