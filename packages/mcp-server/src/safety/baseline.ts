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
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";

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

/**
 * Builds before round 3 reverted session files in the live folder and kept a
 * manifest to finish an interrupted restore. Put back what such a run left
 * reverted, once; nothing writes that manifest any more.
 */
export function recoverBaseline(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const dir = join(
    workspacePrismDir(root, env),
    "receipts",
    "baseline-restore",
  );
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
 * repositories, paths outside the root, directories and symlinks are refused,
 * and so is Yarn Plug'n'Play: its dependency map is tied to the project's own
 * folder, so a copy elsewhere cannot load the test runner. So is a
 * dependency that links back into the live tree (J-02, see
 * {@link liveTreeDependency}).
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
  const link = liveTreeDependency(root);
  if (link) return `${link} links into the live tree`;
  return null;
}

/**
 * The first installed dependency that resolves into the live tree outside
 * every `node_modules` folder, or null (J-02). The copy links `node_modules`
 * from the live folder, so a workspace package linked there
 * (`node_modules/b -> ../packages/b`, pnpm's `.pnpm` links, a nested
 * `packages/a/node_modules/b`) would run the baseline against this
 * session's edits, and a failure the change caused would read as already
 * there. Looks at each `node_modules` folder's packages (scoped too) and at
 * pnpm's `.pnpm` store links.
 */
export function liveTreeDependency(root: string): string | null {
  const live = realpathOr(root);
  for (const folder of dependencyFolders(root)) {
    for (const dir of linkDirs(join(root, folder))) {
      for (const name of entries(dir)) {
        const entry = join(dir, name);
        if (!isSymlink(entry)) continue;
        const rel = relative(live, realpathOr(entry));
        const intoLive = !rel.startsWith("..") && !isAbsolute(rel);
        if (intoLive && !rel.split(sep).includes("node_modules")) {
          return relative(root, entry);
        }
      }
    }
  }
  return null;
}

/** A `node_modules` folder's package folders, its scopes, and pnpm's links. */
function linkDirs(modules: string): string[] {
  const withScopes = (dir: string): string[] => [
    dir,
    ...entries(dir)
      .filter((name) => name.startsWith("@"))
      .map((name) => join(dir, name)),
  ];
  const store = join(modules, ".pnpm");
  return [
    ...withScopes(modules),
    ...entries(store).flatMap((name) =>
      withScopes(
        name === "node_modules"
          ? join(store, name)
          : join(store, name, "node_modules"),
      ),
    ),
  ];
}

function entries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** The real path, or the path itself when it does not resolve (a broken link). */
function realpathOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
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
