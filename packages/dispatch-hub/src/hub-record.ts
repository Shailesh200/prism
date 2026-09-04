import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isProcessAlive } from "@repo-prism/dispatch";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { hubRecordPath, type HubEnv, hubHome } from "./paths.js";
import type { HubRecord } from "./types.js";

const RECORD_MODE = 0o600;

export function newHubToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function readHubRecord(
  env: HubEnv = process.env,
): Promise<HubRecord | undefined> {
  const raw = await readJsonFile<HubRecord | null>(
    hubRecordPath(hubHome(env)),
    null,
  );
  if (!raw || typeof raw.token !== "string" || typeof raw.port !== "number") {
    return undefined;
  }
  return raw;
}

export async function writeHubRecord(
  record: HubRecord,
  env: HubEnv = process.env,
): Promise<void> {
  await writeJsonFile(hubRecordPath(hubHome(env)), record, RECORD_MODE);
}

export function isHubRecordLive(record: HubRecord | undefined): boolean {
  return Boolean(record && isProcessAlive(record.pid));
}

/**
 * The Console's own version, read from its `package.json`.
 *
 * This used to be a hardcoded string, which is stale the moment anyone bumps
 * the manifest and forgets — and it is reported by `/api/healthz`, so the
 * number a user quotes in a bug report was wrong by construction (ADR-0048).
 * Read once and cached: the file cannot change under a running process.
 */
let cachedVersion: string | undefined;

export function packageVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;
  // `dist/` sits one level under the package root, and so does `src/` when
  // vitest runs straight off TypeScript. Both resolve to the same manifest.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "package.json"),
    join(here, "..", "..", "package.json"),
  ]) {
    try {
      const raw = JSON.parse(readFileSync(candidate, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (raw.name === "@repo-prism/dispatch-hub" && raw.version) {
        cachedVersion = raw.version;
        return cachedVersion;
      }
    } catch {
      // Try the next candidate.
    }
  }
  // Never invent a number. An unknown version is reported as unknown so a bug
  // report says "unknown" rather than confidently naming the wrong release.
  cachedVersion = "unknown";
  return cachedVersion;
}
