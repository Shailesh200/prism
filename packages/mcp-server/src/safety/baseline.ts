/**
 * The receipt's baseline (M-092): run a check as if this session's edits had
 * not happened, to tell a failure the session caused from one already there.
 *
 * It runs in a throwaway copy, never in the live folder (round 3, owner
 * decision 1): the agent or the user may be editing the live folder while
 * the check runs. The copy is `HEAD` (checked out through its own index file,
 * so the repository's index, stash and worktree list are untouched), plus
 * every change that was already there before the session, with the session's
 * files left at `HEAD`. Installed dependencies (`node_modules` folders) are
 * linked in, not copied. The copy is removed when the callback ends.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
} from "node:path";
import {
  legacyRepoPrismDir,
  prismHomeDir,
  useLocalPrismStore,
  workspacePrismDir,
} from "@repo-prism/shared/prism-home";

type Entry = { readonly path: string; readonly existed: boolean };
type Manifest = { readonly root: string; readonly entries: readonly Entry[] };

function inside(root: string, rel: string): boolean {
  if (isAbsolute(rel)) return false;
  const full = resolve(root, rel);
  return (
    full.startsWith(`${resolve(root)}/`) && !normalize(rel).startsWith("..")
  );
}

function git(
  root: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
    ...(env ? { env } : {}),
  });
}

function hasHead(root: string): boolean {
  try {
    git(root, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

/** Bytes of `rel` at `HEAD`, or null when `HEAD` has no such file. */
function headBytes(root: string, rel: string): Buffer | null {
  try {
    return execFileSync("git", ["show", `HEAD:./${rel}`], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** The live file's bytes, null when missing, "other" for a non-file. */
function liveBytes(full: string): Buffer | null | "other" {
  if (!existsSync(full)) return null;
  return lstatSync(full).isFile() ? readFileSync(full) : "other";
}

function sameBytes(a: Buffer | null | "other", b: Buffer | null): boolean {
  if (a === "other") return false;
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

/**
 * Every folder where a build before round 3 could have left its restore
 * folder: the current per-workspace folder, the same folder under the
 * pre-2.0 workspace key (the path hashed as given, before symlinks were
 * resolved, so `/tmp/x` and `/private/tmp/x` were two keys), and the
 * checkout's own `.prism` from before the machine-wide store.
 */
function restoreDirs(root: string, env: NodeJS.ProcessEnv): string[] {
  const tail = ["receipts", "baseline-restore"] as const;
  const dirs = [join(workspacePrismDir(root, env), ...tail)];
  if (!useLocalPrismStore(env)) {
    const legacyKey = createHash("sha256")
      .update(resolve(root))
      .digest("hex")
      .slice(0, 24);
    dirs.push(join(prismHomeDir(env), "workspaces", legacyKey, ...tail));
  }
  dirs.push(join(legacyRepoPrismDir(root), ...tail));
  return [...new Set(dirs.map((dir) => resolve(dir)))];
}

/**
 * Keep a restore folder that could not be finished safely: renamed aside so
 * its saved bytes survive and the next run does not try it again.
 */
function setAside(dir: string, what: string): void {
  const kept = `${dir}-kept-${Date.now()}`;
  renameSync(dir, kept);
  process.stderr.write(
    `prism: an interrupted baseline from an older Prism build: ${what}. ` +
      `Kept in ${kept}\n`,
  );
}

function recoverDir(root: string, dir: string): number {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return 0;
  let entries: readonly Entry[];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    if (!Array.isArray(manifest.entries)) throw new Error("no entries");
    entries = manifest.entries;
  } catch {
    // The manifest was written before anything was reverted, so an
    // unreadable one means nothing was. Keep it for a look, never guess.
    setAside(dir, "its restore list is unreadable, so nothing was changed");
    return 0;
  }
  let restored = 0;
  const kept: string[] = [];
  entries.forEach((entry, i) => {
    const rel = typeof entry?.path === "string" ? entry.path : "";
    if (!inside(root, rel)) {
      kept.push(String(entry?.path));
      return;
    }
    const target = join(root, rel);
    const saved = join(dir, String(i));
    if (entry.existed && !existsSync(saved)) return;
    const wanted = entry.existed ? readFileSync(saved) : null;
    const live = liveBytes(target);
    if (sameBytes(live, wanted)) {
      restored += 1;
      return;
    }
    // Only undo the old build's own revert: the file must still be exactly
    // what that run wrote (its `HEAD` bytes, or absent). Anything else was
    // edited since, by the user or the agent, and is never overwritten.
    if (!sameBytes(live, headBytes(root, rel))) {
      kept.push(rel);
      return;
    }
    if (wanted === null) rmSync(target, { force: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, wanted);
    }
    restored += 1;
  });
  if (kept.length > 0) {
    setAside(
      dir,
      `${kept.join(", ")} changed since, so Prism left them as they are; their earlier versions are saved`,
    );
  } else rmSync(dir, { recursive: true, force: true });
  return restored;
}

/**
 * Builds before round 3 reverted session files in the live folder and kept a
 * manifest to finish an interrupted restore. Put back what such a run left
 * reverted, once; nothing writes that manifest any more. A file changed
 * since that run is left alone and its saved copy is kept. Returns how many
 * files are back as they were before that run.
 */
export function recoverBaseline(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  return restoreDirs(root, env).reduce(
    (sum, dir) => sum + recoverDir(root, dir),
    0,
  );
}

/**
 * Why a baseline cannot be taken safely, or null when it can. Untracked-only
 * repositories, paths outside the root, directories and symlinks are refused,
 * and so is Yarn Plug'n'Play: its dependency map is tied to the project's own
 * folder, so a copy elsewhere cannot load the test runner.
 */
export function baselineRefusal(
  root: string,
  paths: readonly string[],
): string | null {
  if (paths.length === 0) return "no session files";
  if (!hasHead(root)) return "no HEAD commit";
  for (const rel of paths) {
    if (!inside(root, rel)) return `${rel} is outside the workspace`;
    const full = join(root, rel);
    if (existsSync(full)) {
      const st = lstatSync(full);
      if (!st.isFile()) return `${rel} is not a regular file`;
    }
  }
  if (existsSync(join(root, ".pnp.cjs"))) {
    return "Yarn Plug'n'Play dependencies cannot be used from a copy";
  }
  return null;
}

/** Paths changed against `HEAD` in the live folder (tracked and untracked). */
function changedPaths(root: string): string[] {
  const out = git(root, [
    "--no-optional-locks",
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--no-renames",
  ]);
  return out
    .split("\0")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3));
}

/** Installed dependency folders git ignores: linked into the copy. */
function dependencyFolders(root: string): string[] {
  return git(root, [
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--directory",
  ])
    .split("\n")
    .map((line) => line.replace(/\/$/, ""))
    .filter((path) => basename(path) === "node_modules");
}

/**
 * Run `fn` in a throwaway copy of `root` where `paths` are as at `HEAD`, then
 * remove the copy. `fn` gets the copy's root. Returns null (and runs nothing)
 * when `baselineRefusal` refuses. The live folder is only read.
 */
export async function withBaselineCopy<T>(
  root: string,
  paths: readonly string[],
  fn: (copyRoot: string) => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T | null> {
  recoverBaseline(root, env);
  if (baselineRefusal(root, paths) !== null) return null;
  const temp = mkdtempSync(join(tmpdir(), "prism-baseline-"));
  const copy = join(temp, "tree");
  try {
    const gitEnv = { ...process.env, GIT_INDEX_FILE: join(temp, "index") };
    git(root, ["read-tree", "HEAD"], gitEnv);
    git(root, ["checkout-index", "--all", `--prefix=${copy}/`], gitEnv);
    const session = new Set(paths);
    // What was already changed before the session stays changed.
    for (const rel of changedPaths(root)) {
      if (session.has(rel) || !inside(root, rel)) continue;
      const from = join(root, rel);
      const to = join(copy, rel);
      if (!existsSync(from)) rmSync(to, { force: true });
      else if (lstatSync(from).isFile()) {
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
      }
    }
    for (const rel of dependencyFolders(root)) {
      const to = join(copy, rel);
      if (existsSync(to)) continue;
      mkdirSync(dirname(to), { recursive: true });
      symlinkSync(join(root, rel), to, "dir");
    }
    return await fn(copy);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
