/**
 * Stored change receipts (plan §5.7): one file per receipt id under
 * `~/.prism/workspaces/<key>/receipts/<id>.json`, written atomically. The
 * daemon writes the structural receipt at once and overwrites it when the
 * background checks finish; `prism receipts` and the next stop read it back.
 *
 * Import from `@repo-prism/shared/receipt-store`; this file uses `node:fs`.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { recordEvent } from "./events.js";
import { workspacePrismDir } from "./prism-home.js";
import { ChangeReceiptSchema, type ChangeReceipt } from "./receipt.js";

const RECEIPT_ID = /^[a-f0-9]{8,64}$/;

export function receiptsDir(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(root, env), "receipts");
}

/** Atomic write (temp file + rename), so a reader never sees half a receipt. */
export function writeStoredReceipt(
  root: string,
  receipt: ChangeReceipt,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!RECEIPT_ID.test(receipt.id)) {
    throw new Error(`receipt id ${receipt.id} is not a hex id`);
  }
  const dir = receiptsDir(root, env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${receipt.id}.json`);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  renameSync(temp, path);
  return path;
}

/**
 * The stored receipt with this id, or null when there is none. A file that
 * does not parse as a receipt is moved aside as `*.corrupt-<ts>` and logged
 * (`receipt.corrupt`), never read again.
 */
export function readStoredReceipt(
  root: string,
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): ChangeReceipt | null {
  if (!RECEIPT_ID.test(id)) return null;
  const path = join(receiptsDir(root, env), `${id}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return parseOrQuarantine(path, raw, root, env);
}

function parseOrQuarantine(
  path: string,
  raw: string,
  root: string,
  env: NodeJS.ProcessEnv,
): ChangeReceipt | null {
  let reason: string;
  try {
    const parsed = ChangeReceiptSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    reason = parsed.error.issues[0]?.message ?? "schema mismatch";
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  renameSync(path, `${path}.corrupt-${Date.now()}`);
  recordEvent(
    { event: "receipt.corrupt", outcome: "degraded", reason, workspace: root },
    { env },
  );
  return null;
}

/** Every stored receipt, newest first. */
export function listStoredReceipts(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): ChangeReceipt[] {
  const dir = receiptsDir(root, env);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const rows: { receipt: ChangeReceipt; mtime: number }[] = [];
  for (const name of names) {
    const match = /^([a-f0-9]{8,64})\.json$/.exec(name);
    if (!match?.[1]) continue;
    const path = join(dir, name);
    const receipt = parseOrQuarantine(
      path,
      readFileSync(path, "utf8"),
      root,
      env,
    );
    if (receipt) rows.push({ receipt, mtime: statSync(path).mtimeMs });
  }
  return rows
    .sort(
      (a, b) =>
        b.receipt.generatedAt.localeCompare(a.receipt.generatedAt) ||
        b.mtime - a.mtime,
    )
    .map((row) => row.receipt);
}
