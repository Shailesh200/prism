/**
 * Where `prism start` keeps what it replaces (round 5, consent):
 * `~/.prism-backups/<stamp>/configs/` for agent configs about to change and
 * `~/.prism-backups/<stamp>/1x/` for 1.x data. Outside `~/.prism`, so a later
 * `rm -rf ~/.prism` keeps the backups and a move never lands in its own source.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
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
    const code = (error as NodeJS.ErrnoException).code;
    // A 1.x folder such as ~/.prism/dispatch is often non-empty, and the
    // backup path may already exist. Copy, then remove the source.
    if (
      code !== "EXDEV" &&
      code !== "ENOTEMPTY" &&
      code !== "EEXIST" &&
      code !== "EPERM" &&
      code !== "EBUSY"
    ) {
      throw error;
    }
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
    rmSync(src, { recursive: true, force: true });
  }
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

/** Copy each existing path into `<dir>/configs/`; returns the copies made. */
export function backupConfigs(
  dir: string,
  paths: readonly string[],
  home: string,
): string[] {
  const made: string[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const to = configBackupPath(dir, path, home);
    mkdirSync(dirname(to), { recursive: true });
    const info = lstatSync(path);
    cpSync(path, to, {
      recursive: info.isDirectory(),
      verbatimSymlinks: true,
    });
    made.push(to);
  }
  return made;
}
