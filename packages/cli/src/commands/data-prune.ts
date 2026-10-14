/**
 * `prism data prune` (M-090).
 *
 * Dry run unless `--yes`. It only ever removes three kinds of thing under
 * `~/.prism/workspaces`: empty workspace folders, the index cache of a
 * workspace whose checkout is gone, and Dispatch worktree folders git no
 * longer tracks. The Envelope ledger, receipts, prepare history, the hook
 * snapshot and the index of a live checkout are never candidates.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { ok } from "@repo-prism/shared";
import { prismHomeDir } from "@repo-prism/shared/prism-home";
import { paint, renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";

export type PruneReason =
  | "empty workspace folder"
  | "checkout no longer on disk"
  | "worktree git no longer tracks";

export type PruneItem = {
  readonly path: string;
  readonly reason: PruneReason;
  readonly bytes: number;
};

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
    [join(dir, "dispatch", "meta.json"), "path"],
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

/** A worktree folder whose `.git` pointer is missing or points nowhere. */
function isOrphanWorktree(path: string): boolean {
  const pointer = join(path, ".git");
  if (!existsSync(pointer)) return true;
  try {
    if (statSync(pointer).isDirectory()) return false;
    const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(pointer, "utf8"));
    return !match || !existsSync(match[1]!.trim());
  } catch {
    return true;
  }
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
    const cache = join(dir, "cache");
    if (checkout && !existsSync(checkout) && existsSync(cache)) {
      items.push({
        path: cache,
        reason: "checkout no longer on disk",
        bytes: sizeOf(cache),
      });
    }
    const trees = join(dir, "dispatch", "worktrees");
    if (!existsSync(trees)) continue;
    for (const name of readdirSync(trees).sort()) {
      const tree = join(trees, name);
      if (!statSync(tree).isDirectory() || !isOrphanWorktree(tree)) continue;
      items.push({
        path: tree,
        reason: "worktree git no longer tracks",
        bytes: sizeOf(tree),
      });
    }
  }
  return items;
}

export function applyPrune(items: readonly PruneItem[]): void {
  for (const item of items) rmSync(item.path, { recursive: true, force: true });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const dataCommand: CommandHandler = async (context) => {
  const action = context.args.positionals[0] ?? "prune";
  if (action !== "prune") {
    return ok({
      data: { error: `unknown action: ${action}` },
      findings: true,
      human: () =>
        `prism data: unknown action "${action}". Try: prism data prune`,
    });
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
