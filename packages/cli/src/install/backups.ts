/**
 * Where `prism start` keeps what it replaces (round 5, consent):
 * `~/.prism-backups/<stamp>/configs/` for agent configs about to change and
 * `~/.prism-backups/<stamp>/1x/` for 1.x data. Outside `~/.prism`, so a later
 * `rm -rf ~/.prism` keeps the backups and a move never lands in its own source.
 */
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { prismHomeDir } from "@repo-prism/shared/prism-home";

/** `20261017T104541`: sortable, no characters a shell or Windows minds. */
export function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
}

/** `~/.prism-backups/<stamp>`, next to the Prism home (`PRISM_HOME` aware). */
export function backupDir(env: NodeJS.ProcessEnv, now: Date): string {
  return join(dirname(prismHomeDir(env)), ".prism-backups", stamp(now));
}

/** Suffixes tried before giving up on a free backup folder name. */
const RESERVE_TRIES = 100;

/**
 * Create the backup folder for this run and return it (Arc review). Never an
 * existing one: `stamp` has one-second resolution, and copying or renaming
 * into an earlier run's folder would overwrite its backups. `mkdir` without
 * `recursive` fails with EEXIST, so `-2`, `-3`… is tried instead.
 */
export function reserveBackupDir(base: string): string {
  mkdirSync(dirname(base), { recursive: true });
  for (let n = 1; n <= RESERVE_TRIES; n++) {
    const dir = n === 1 ? base : `${base}-${n}`;
    try {
      mkdirSync(dir, { mode: 0o700 });
      return dir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error(`No free backup folder next to ${base}`);
}

type Lstat = ReturnType<typeof lstatSync>;

/** `lstat`, or undefined when nothing is there. A dangling link is there. */
export function lstatOrUndefined(path: string): Lstat | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Show a path under `home` as `~/…`. */
export function tilde(path: string, home: string): string {
  const rel = relative(home, path);
  if (rel === "") return "~";
  return rel.startsWith("..") || isAbsolute(rel) ? path : `~/${rel}`;
}

/**
 * Move `src` to `dest` (parents created). A symlink moves as the link, never
 * followed. Across file systems (EXDEV) it copies, then removes the source.
 */
export function moveInto(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  try {
    renameSync(src, dest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
    rmSync(src, { recursive: true, force: true });
  }
}

/**
 * Move a whole tree to `dest`, which must not exist yet, in one step: a
 * rename, so it either fully happens or not at all. Across file systems
 * (EXDEV) it copies first and removes the source only after the copy is
 * complete; a failed copy is removed again, so `src` is never left partial.
 */
export function moveWhole(src: string, dest: string): void {
  try {
    renameSync(src, dest);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }
  try {
    cpSync(src, dest, {
      recursive: true,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
    });
  } catch (error) {
    rmSync(dest, { recursive: true, force: true });
    throw error;
  }
  rmSync(src, { recursive: true, force: true });
}

/** Where a config at `path` is kept inside `<backup>/configs/`. */
export function configBackupPath(
  dir: string,
  path: string,
  home: string,
): string {
  const rel = relative(home, path);
  const inside = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  return join(dir, "configs", inside ? rel : join("_abs", path));
}

/**
 * Copy each existing path into `<dir>/configs/`; returns the copies made.
 * `lstat`, not `exists` (Arc review): a dangling symlink is backed up as the
 * link instead of being skipped. A live symlink (stow, chezmoi) is written
 * through to its target, so the target's content is what changes and what
 * is backed up; the link itself is left as it is.
 */
export function backupConfigs(
  dir: string,
  paths: readonly string[],
  home: string,
): string[] {
  const made: string[] = [];
  for (const path of paths) {
    const info = lstatOrUndefined(path);
    if (!info) continue;
    const to = configBackupPath(dir, path, home);
    mkdirSync(dirname(to), { recursive: true });
    let source = path;
    let recursive = info.isDirectory();
    if (info.isSymbolicLink()) {
      try {
        source = realpathSync(path);
        recursive = lstatSync(source).isDirectory();
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ELOOP") throw error;
        // Dangling (or a loop): keep the link itself. `cpSync` cannot copy a
        // dangling link given as its source, so it is recreated.
        symlinkSync(readlinkSync(path), to);
        made.push(to);
        continue;
      }
    }
    cpSync(source, to, { recursive, verbatimSymlinks: true });
    made.push(to);
  }
  return made;
}
