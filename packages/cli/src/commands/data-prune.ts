/**
 * `prism data prune` (M-090).
 *
 * Dry run unless `--yes` (plan C-3, PRUNE-1…3). Under `~/.prism/workspaces`
 * it only ever touches three kinds of thing: empty workspace folders, the
 * index cache of a workspace whose checkout is gone, and receipt history
 * beyond the last 20 receipts of a workspace. Lenses, config,
 * prepare history, the hook snapshot, the last 20 receipts and the
 * index of a live checkout are never candidates. Session stores under
 * `~/.prism/sessions` older than 24 h are pruned (P4). Feedback rows older than 30 d are pruned (P6).
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { err, ok, prismError, PrismErrorCode } from "@repo-prism/shared";
import { prismHomeDir } from "@repo-prism/shared/prism-home";
import { paint, renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";
import { pruneFeedback } from "@repo-prism/shared/feedback-store";
import { pruneSessionStores } from "@repo-prism/shared/session-store";

export type PruneReason =
  | "empty workspace folder"
  | "checkout no longer on disk"
  | "receipts beyond the last 20"
  | "session store older than 24h"
  | "feedback older than 30d";

export type PruneItem = {
  readonly path: string;
  readonly reason: PruneReason;
  readonly bytes: number;
  /** For receipt history: how many of the newest lines to keep. */
  readonly keepLastLines?: number;
};

/** Receipts kept per workspace (C-3). */
export const RECEIPTS_KEPT = 20;

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The checkout a workspace folder belongs to, from the files that name it. */
export function recordedRoot(dir: string): string | null {
  const sources: [string, string][] = [
    [join(dir, "hooks", "snapshot.json"), "workspace"],
  ];
  for (const [file, key] of sources) {
    const value = readJson(file)?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function sizeOf(path: string): number {
  try {
    const st = statSync(path);
    if (!st.isDirectory()) return st.size;
    return readdirSync(path).reduce(
      (sum, name) => sum + sizeOf(join(path, name)),
      0,
    );
  } catch {
    return 0;
  }
}

function isEmptyTree(path: string): boolean {
  try {
    return readdirSync(path).every((name) => {
      const child = join(path, name);
      return statSync(child).isDirectory() && isEmptyTree(child);
    });
  } catch {
    return false;
  }
}

export function planSessionPrune(home: string): PruneItem[] {
  const deleted = pruneSessionStores({ ...process.env, PRISM_HOME: home });
  return deleted.map((path) => ({
    path,
    reason: "session store older than 24h" as const,
    bytes: 0,
  }));
}

export function planPrune(home: string): PruneItem[] {
  const root = join(home, "workspaces");
  if (!existsSync(root)) return [];
  const items: PruneItem[] = [];
  for (const key of readdirSync(root).sort()) {
    const dir = join(root, key);
    if (!statSync(dir).isDirectory()) continue;
    if (isEmptyTree(dir)) {
      items.push({ path: dir, reason: "empty workspace folder", bytes: 0 });
      continue;
    }
    const checkout = recordedRoot(dir);
    const feedbackFile = join(dir, "feedback.jsonl");
    if (checkout && existsSync(feedbackFile)) {
      const dropped = pruneFeedback(checkout, {
        ...process.env,
        PRISM_HOME: home,
      });
      if (dropped > 0) {
        items.push({
          path: feedbackFile,
          reason: "feedback older than 30d",
          bytes: 0,
        });
      }
    }
    const cache = join(dir, "cache");
    if (checkout && !existsSync(checkout) && existsSync(cache)) {
      items.push({
        path: cache,
        reason: "checkout no longer on disk",
        bytes: sizeOf(cache),
      });
    }
    const history = join(dir, "receipts", "history.jsonl");
    if (existsSync(history)) {
      const lines = readFileSync(history, "utf8").split("\n").filter(Boolean);
      if (lines.length > RECEIPTS_KEPT) {
        const dropped = lines.slice(0, lines.length - RECEIPTS_KEPT);
        items.push({
          path: history,
          reason: "receipts beyond the last 20",
          bytes: dropped.reduce((sum, line) => sum + line.length + 1, 0),
          keepLastLines: RECEIPTS_KEPT,
        });
      }
    }
    // Stored receipts (plan §5.7): one `<id>.json` each; keep the newest 20.
    const receiptDir = join(dir, "receipts");
    if (existsSync(receiptDir)) {
      const stored = readdirSync(receiptDir)
        .filter((name) => /^[a-f0-9]{8,64}\.json$/.test(name))
        .map((name) => {
          const path = join(receiptDir, name);
          const info = statSync(path);
          return { path, mtime: info.mtimeMs, bytes: info.size };
        })
        .sort((a, b) => b.mtime - a.mtime);
      for (const old of stored.slice(RECEIPTS_KEPT)) {
        items.push({
          path: old.path,
          reason: "receipts beyond the last 20",
          bytes: old.bytes,
        });
      }
    }
  }
  return [...items, ...planSessionPrune(home)];
}

export function applyPrune(items: readonly PruneItem[]): void {
  for (const item of items) {
    if (item.keepLastLines !== undefined) {
      const lines = readFileSync(item.path, "utf8").split("\n").filter(Boolean);
      writeFileSync(
        item.path,
        `${lines.slice(-item.keepLastLines).join("\n")}\n`,
      );
      continue;
    }
    rmSync(item.path, { recursive: true, force: true });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const dataCommand: CommandHandler = async (context) => {
  const action = context.args.positionals[0] ?? "prune";
  if (action !== "prune") {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Unknown action "${action}". Usage: prism data prune [--yes]`,
      ),
    );
  }
  const home = prismHomeDir();
  const items = planPrune(home);
  const apply = context.options.yes;
  if (apply) applyPrune(items);
  const total = items.reduce((sum, item) => sum + item.bytes, 0);
  return ok({
    data: { home, applied: apply, items, bytes: total },
    human({ color }) {
      const lines = [renderHeading("Prism data prune", color), ""];
      if (items.length === 0) {
        lines.push(`Nothing to prune under ${home}.`);
        return lines.join("\n");
      }
      for (const item of items) {
        lines.push(
          `${paint(apply ? "removed" : "would remove", apply ? "green" : "yellow", color)}  ${item.path}`,
          `    ${item.reason} · ${formatBytes(item.bytes)}`,
        );
      }
      lines.push(
        "",
        apply
          ? `Removed ${items.length} item(s), ${formatBytes(total)}.`
          : `${items.length} item(s), ${formatBytes(total)}. Run with --yes to remove them.`,
      );
      return lines.join("\n");
    },
  });
};
