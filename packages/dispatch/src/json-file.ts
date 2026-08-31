import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

export async function writeJsonFile(
  path: string,
  value: unknown,
  mode?: number,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (mode !== undefined) {
    await chmod(path, mode);
  }
}
