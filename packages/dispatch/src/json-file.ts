import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function readTextFile(
  path: string,
  fallback: string,
): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return fallback;
  }
}

export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    return (raw as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write via a sibling temp file and rename (M-067 P-S1).
 *
 * `jobs.json` is read-modify-written by the MCP process, the hub daemon and
 * every worker supervisor. A direct `writeFile` truncates before it fills, so
 * a concurrent reader could see an empty or half-written file and silently
 * parse it as "no jobs" — which is exactly how a board full of work goes
 * blank. `rename(2)` within a directory is atomic on POSIX and on NTFS, so a
 * reader sees either the whole previous file or the whole next one.
 *
 * The temp name carries the pid *and* a random suffix. Pid alone is not
 * enough: two writers inside one process (the queue drain and a `job_control`
 * call, say) can land in the same millisecond, share a staging path, and then
 * the second `rename` fails with ENOENT because the first already moved it.
 */
export async function writeJsonFile(
  path: string,
  value: unknown,
  mode?: number,
): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const temp = join(
    dir,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    if (mode !== undefined) {
      await chmod(temp, mode);
    }
    await rename(temp, path);
  } catch (cause) {
    await unlink(temp).catch(() => {});
    throw cause;
  }
}
