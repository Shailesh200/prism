/**
 * The receipt's baseline (M-092): run a check as if this session's edits had
 * not happened, to tell a failure the session caused from one already there.
 *
 * It does not use `git stash`, so neither the index nor the stash list is
 * touched. Each session file's current bytes are copied aside, the file is
 * put back to `HEAD` (or removed, if `HEAD` lacks it), the callback runs, and
 * every file is written back byte for byte. A manifest written before the
 * first change lets the next run finish a restore a crash interrupted.
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";

type Entry = { readonly path: string; readonly existed: boolean };
type Manifest = { readonly root: string; readonly entries: readonly Entry[] };

function restoreDir(root: string, env: NodeJS.ProcessEnv): string {
  return join(workspacePrismDir(root, env), "receipts", "baseline-restore");
}

function inside(root: string, rel: string): boolean {
  if (isAbsolute(rel)) return false;
  const full = resolve(root, rel);
  return (
    full.startsWith(`${resolve(root)}/`) && !normalize(rel).startsWith("..")
  );
}

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

function hasHead(root: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** Put back any files a previous, interrupted baseline run left reverted. */
export function recoverBaseline(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const dir = restoreDir(root, env);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return 0;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  let restored = 0;
  manifest.entries.forEach((entry, i) => {
    const target = join(root, entry.path);
    if (entry.existed) {
      const saved = join(dir, String(i));
      if (!existsSync(saved)) return;
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(saved, target);
    } else {
      rmSync(target, { force: true });
    }
    restored += 1;
  });
  rmSync(dir, { recursive: true, force: true });
  return restored;
}

/**
 * Why a baseline cannot be taken safely, or null when it can. Untracked-only
 * repositories, paths outside the root, directories and symlinks are refused.
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
  return null;
}

/**
 * Run `fn` with `paths` put back to `HEAD`, then restore them. Returns null
 * (and runs nothing) when `baselineRefusal` refuses.
 */
export async function withBaselineTree<T>(
  root: string,
  paths: readonly string[],
  fn: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T | null> {
  recoverBaseline(root, env);
  if (baselineRefusal(root, paths) !== null) return null;
  const dir = restoreDir(root, env);
  mkdirSync(dir, { recursive: true });
  const entries: Entry[] = paths.map((path) => ({
    path,
    existed: existsSync(join(root, path)),
  }));
  entries.forEach((entry, i) => {
    if (entry.existed)
      copyFileSync(join(root, entry.path), join(dir, String(i)));
  });
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ root, entries } satisfies Manifest),
  );
  try {
    for (const entry of entries) {
      const target = join(root, entry.path);
      const head = headBytes(root, entry.path);
      if (head === null) {
        rmSync(target, { force: true });
      } else {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, head);
      }
    }
    return await fn();
  } finally {
    recoverBaseline(root, env);
  }
}
