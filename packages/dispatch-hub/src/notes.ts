/**
 * Job write-ups under `.prism/dispatch/notes/`.
 *
 * The Console used to show only the clipped result summary. Notes are the
 * full findings the worker actually wrote, served through the hub so the
 * browser never reads the filesystem itself.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const NOTES_DIR = ".prism/dispatch/notes";
const MAX_NOTE_BYTES = 256 * 1024;

function isDispatchNotePath(value: string): boolean {
  const n = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!n.startsWith(`${NOTES_DIR}/`) || !n.endsWith(".md")) return false;
  if (n.includes("..") || n.includes("//")) return false;
  return n.slice(NOTES_DIR.length + 1).length > 0;
}

function notePathsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/`([^`\n]{2,200})`/g)) {
    const raw = match[1]?.trim();
    if (raw && isDispatchNotePath(raw)) {
      found.add(raw.replace(/\\/g, "/").replace(/^\.\//, ""));
    }
  }
  for (const match of text.matchAll(
    /\.prism\/dispatch\/notes\/[\w./-]+\.md/g,
  )) {
    if (isDispatchNotePath(match[0])) {
      found.add(match[0].replace(/\\/g, "/").replace(/^\.\//, ""));
    }
  }
  return [...found];
}

export type JobNoteListItem = {
  readonly path: string;
  readonly title: string;
};

export type JobNoteFile = {
  readonly path: string;
  readonly text: string;
  readonly truncated: boolean;
};

export function noteTitle(rel: string): string {
  const base = rel.replace(/\\/g, "/").split("/").pop() ?? rel;
  return base.replace(/\.md$/i, "");
}

function containedIn(root: string, abs: string): boolean {
  const rel = relative(resolve(root), resolve(abs));
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
}

function candidateRoots(
  workspace: string,
  worktreePath?: string,
): readonly string[] {
  if (worktreePath && resolve(worktreePath) !== resolve(workspace)) {
    return [workspace, worktreePath];
  }
  return [workspace];
}

/** Resolve a notes path against the job's workspace (and worktree, if any). */
export function resolveJobNotePath(
  workspace: string,
  rel: string,
  worktreePath?: string,
): string | undefined {
  if (!isDispatchNotePath(rel)) return undefined;
  const n = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  for (const root of candidateRoots(workspace, worktreePath)) {
    const abs = join(root, n);
    const notesRoot = join(root, NOTES_DIR);
    if (containedIn(notesRoot, abs) || resolve(abs) === resolve(notesRoot)) {
      return abs;
    }
  }
  return undefined;
}

async function filesInNotesDir(root: string): Promise<string[]> {
  const dir = join(root, NOTES_DIR);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `${NOTES_DIR}/${entry.name}`);
  } catch {
    return [];
  }
}

export async function listJobNotes(input: {
  readonly workspace: string;
  readonly worktreePath?: string;
  readonly jobId: string;
  readonly summary?: string;
  readonly stored?: readonly string[];
}): Promise<JobNoteListItem[]> {
  const found = new Set<string>();
  for (const path of input.stored ?? []) {
    if (isDispatchNotePath(path)) {
      found.add(path.replace(/\\/g, "/").replace(/^\.\//, ""));
    }
  }
  for (const path of notePathsFromText(input.summary ?? "")) {
    found.add(path);
  }
  const slug = input.jobId.toLowerCase();
  for (const root of candidateRoots(input.workspace, input.worktreePath)) {
    for (const path of await filesInNotesDir(root)) {
      const name = (path.split("/").pop() ?? "").toLowerCase();
      if (name.includes(slug) || found.has(path)) found.add(path);
    }
  }
  return [...found].map((path) => ({ path, title: noteTitle(path) }));
}

export async function readJobNote(input: {
  readonly workspace: string;
  readonly rel: string;
  readonly worktreePath?: string;
}): Promise<JobNoteFile | undefined> {
  const abs = resolveJobNotePath(
    input.workspace,
    input.rel,
    input.worktreePath,
  );
  if (!abs) return undefined;
  try {
    const info = await stat(abs);
    if (!info.isFile()) return undefined;
    const raw = await readFile(abs);
    const truncated = raw.byteLength > MAX_NOTE_BYTES;
    const slice = truncated ? raw.subarray(0, MAX_NOTE_BYTES) : raw;
    const path = input.rel.replace(/\\/g, "/").replace(/^\.\//, "");
    return {
      path,
      text: slice.toString("utf8"),
      truncated,
    };
  } catch {
    return undefined;
  }
}
