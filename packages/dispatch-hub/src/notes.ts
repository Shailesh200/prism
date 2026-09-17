/**
 * Job write-ups under `.prism/dispatch/notes/`.
 *
 * The Console used to show only the clipped result summary. Notes are the
 * full findings the worker actually wrote, served through the hub so the
 * browser never reads the filesystem itself.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  legacyRepoPrismDir,
  workspaceNotesDir,
} from "@repo-prism/shared/prism-home";

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

function noteFileName(rel: string): string {
  return rel
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .slice(NOTES_DIR.length + 1);
}

function notesDirsFor(root: string): string[] {
  const dest = workspaceNotesDir(root);
  const leftover = join(legacyRepoPrismDir(root), "dispatch", "notes");
  return dest === leftover ? [dest] : [dest, leftover];
}

function noteAbsCandidates(
  workspace: string,
  rel: string,
  worktreePath?: string,
): string[] {
  const name = noteFileName(rel);
  const out: string[] = [];
  for (const root of candidateRoots(workspace, worktreePath)) {
    for (const dir of notesDirsFor(root)) {
      const abs = join(dir, name);
      if (containedIn(dir, abs) || resolve(abs) === resolve(dir)) {
        out.push(abs);
      }
    }
  }
  return out;
}

/** Resolve a notes path against the job's workspace (and worktree, if any). */
export function resolveJobNotePath(
  workspace: string,
  rel: string,
  worktreePath?: string,
): string | undefined {
  if (!isDispatchNotePath(rel)) return undefined;
  const candidates = noteAbsCandidates(workspace, rel, worktreePath);
  return candidates.find((abs) => existsSync(abs)) ?? candidates[0];
}

async function filesInNotesDir(root: string): Promise<string[]> {
  const found = new Set<string>();
  for (const dir of notesDirsFor(root)) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          found.add(`${NOTES_DIR}/${entry.name}`);
        }
      }
    } catch {
      /* missing notes dir */
    }
  }
  return [...found];
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
  if (!isDispatchNotePath(input.rel)) return undefined;
  const path = input.rel.replace(/\\/g, "/").replace(/^\.\//, "");
  for (const abs of noteAbsCandidates(
    input.workspace,
    input.rel,
    input.worktreePath,
  )) {
    try {
      const info = await stat(abs);
      if (!info.isFile()) continue;
      const raw = await readFile(abs);
      const truncated = raw.byteLength > MAX_NOTE_BYTES;
      const slice = truncated ? raw.subarray(0, MAX_NOTE_BYTES) : raw;
      return {
        path,
        text: slice.toString("utf8"),
        truncated,
      };
    } catch {
      /* try leftover / worktree copy */
    }
  }
  return undefined;
}
