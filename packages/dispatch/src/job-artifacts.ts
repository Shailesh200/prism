/**
 * Treat the agent's closing text as untrusted (ADR-0042 §2).
 *
 * A shipped job reported "Intelligence reports are in `.prism/audit/`; the
 * full write-up is at `.prism/dispatch/notes/…md`". Both existed only inside
 * a gitignored worktree, so the user read repo-relative paths that were not
 * there. Summaries now cite what the branch actually carries, or say nothing.
 */

import { access } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

export type PathAudit = {
  /** Cited, exists, and carried by the job's commits. */
  readonly delivered: string[];
  /** Cited and on disk, but not committed — unreachable after prune. */
  readonly uncommitted: string[];
  /** Cited and absent. The model made it up. */
  readonly missing: string[];
};

const PATH_TOKEN = /`([^`\n]{2,200})`/g;
const NOTE_PREFIX = ".prism/dispatch/notes/";

export function isDispatchNotePath(value: string): boolean {
  const n = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!n.startsWith(NOTE_PREFIX) || !n.endsWith(".md")) return false;
  if (n.includes("..") || n.includes("//")) return false;
  return n.slice(NOTE_PREFIX.length).length > 0;
}

function normaliseNotePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Write-up paths the job actually left on disk (delivered or uncommitted). */
export function notePathsOf(audit: PathAudit): string[] {
  return [
    ...new Set(
      [...audit.delivered, ...audit.uncommitted].filter(isDispatchNotePath),
    ),
  ];
}

/** Note paths claimed in prose, including those the model never wrote. */
export function notePathsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PATH_TOKEN)) {
    const raw = match[1]?.trim();
    if (raw && isDispatchNotePath(raw)) found.add(normaliseNotePath(raw));
  }
  for (const match of text.matchAll(
    /\.prism\/dispatch\/notes\/[\w./-]+\.md/g,
  )) {
    if (isDispatchNotePath(match[0])) found.add(normaliseNotePath(match[0]));
  }
  return [...found];
}

function looksLikePath(token: string): boolean {
  const value = token.trim();
  if (!value || /\s/.test(value)) return false;
  // Skip commands, URLs, and globs — they are not artifact claims.
  if (/^(https?:|git |bun |npm |node )/.test(value)) return false;
  if (value.includes("*")) return false;
  if (value.includes("/") || value.startsWith(".")) return true;
  // A bare filename with an extension is still an artifact claim.
  return /^[\w-]+\.\w{1,6}$/.test(value);
}

function normalise(token: string, worktreePath: string): string {
  const value = token.trim().replace(/[),.;:]+$/, "");
  if (isAbsolute(value)) {
    const rel = relative(worktreePath, value);
    return rel && !rel.startsWith("..") ? rel : value;
  }
  return value.replace(/^\.\//, "");
}

export function citedPaths(text: string, worktreePath: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PATH_TOKEN)) {
    const raw = match[1];
    if (!raw || !looksLikePath(raw)) continue;
    found.add(normalise(raw, worktreePath));
  }
  return [...found];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Classify every path the summary claims, against disk and against the commit. */
export async function auditCitedPaths(input: {
  readonly text: string;
  readonly worktreePath: string;
  readonly committedPaths: readonly string[];
}): Promise<PathAudit> {
  const committed = new Set(
    input.committedPaths.map((path) => path.replace(/^\.\//, "")),
  );
  const delivered: string[] = [];
  const uncommitted: string[] = [];
  const missing: string[] = [];

  for (const path of citedPaths(input.text, input.worktreePath)) {
    if (committed.has(path)) {
      delivered.push(path);
      continue;
    }
    if (await exists(join(input.worktreePath, path))) {
      uncommitted.push(path);
      continue;
    }
    missing.push(path);
  }
  return { delivered, uncommitted, missing };
}

/**
 * Strip absolute worktree paths out of chat text. The worktree location is
 * never spoken (ADR-0039), so a leaked absolute path is both noise and a
 * path the user cannot act on.
 */
export function stripWorktreePaths(text: string, worktreePath: string): string {
  if (!worktreePath) return text;
  const escaped = worktreePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replaceAll(new RegExp(`${escaped}/?`, "g"), "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** One clause naming what the model claimed but did not write. */
export function fabricationNote(audit: PathAudit): string {
  if (audit.missing.length === 0) return "";
  const shown = audit.missing.slice(0, 2).join(", ");
  const extra =
    audit.missing.length > 2 ? ` (+${audit.missing.length - 2} more)` : "";
  return `It mentioned ${shown}${extra}, which was not written.`;
}
