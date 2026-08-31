import { randomBytes } from "node:crypto";
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

export function packageVersion(): string {
  return "1.1.15";
}
