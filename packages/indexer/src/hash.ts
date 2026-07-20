import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BINARY_SNIFF_BYTES } from "./constants.js";

export const HASH_ALGO = "sha256" as const;

export function hashBufferSha256(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function hashFileSha256(absolutePath: string): Promise<string> {
  const buf = await readFile(absolutePath);
  return hashBufferSha256(buf);
}

/** True if the buffer looks like binary (NUL in the sniff window). */
export function looksBinary(
  buf: Buffer,
  sniffBytes = BINARY_SNIFF_BYTES,
): boolean {
  const end = Math.min(buf.length, sniffBytes);
  for (let i = 0; i < end; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}
