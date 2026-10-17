import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { daemonRecordPath } from "./paths.js";

export type DaemonRecord = {
  readonly pid: number;
  readonly port: number;
  readonly token: string;
  /** Package version plus build stamp. A client with a different one does not attach. */
  readonly buildId: string;
  readonly startedAt: string;
};

export function newDaemonToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function readDaemonRecord(
  env: NodeJS.ProcessEnv = process.env,
): Promise<DaemonRecord | undefined> {
  try {
    const raw = JSON.parse(
      await readFile(daemonRecordPath(env), "utf8"),
    ) as Partial<DaemonRecord>;
    if (
      typeof raw.pid !== "number" ||
      typeof raw.port !== "number" ||
      typeof raw.token !== "string" ||
      typeof raw.buildId !== "string"
    ) {
      return undefined;
    }
    return {
      pid: raw.pid,
      port: raw.port,
      token: raw.token,
      buildId: raw.buildId,
      startedAt: typeof raw.startedAt === "string" ? raw.startedAt : "",
    };
  } catch {
    return undefined;
  }
}

/** Written to a temp file and renamed, so a reader never sees half a token. */
export async function writeDaemonRecord(
  record: DaemonRecord,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = daemonRecordPath(env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
}

/** Removes the record only if it still names `pid`, so a successor's record survives. */
export async function removeDaemonRecord(
  pid: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const current = await readDaemonRecord(env);
  if (current && current.pid !== pid) return;
  await rm(daemonRecordPath(env), { force: true });
}
