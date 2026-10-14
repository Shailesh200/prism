/**
 * Machine-wide Prism library (`~/.prism`) and the per-repo folder under it.
 *
 * Production never writes `<repo>/.prism`. Per-checkout state lives at
 * `~/.prism/workspaces/<key>/` (same 24-char key as ADR-0054). Vitest
 * fixtures without `PRISM_HOME` still use the temp tree's `.prism`, and the
 * machine-wide files (events, lenses, install.json) go to a per-process temp
 * home, so the suite never touches the developer's library.
 *
 * Import from `@repo-prism/shared/prism-home`, never the package barrel —
 * this file uses `node:crypto` / `node:fs`.
 */

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  rewriteMemoryAnchors,
  type MemoryAnchorChange,
} from "./memory-anchors.js";

export type { MemoryAnchorChange } from "./memory-anchors.js";

export type WorkspaceMemory = {
  readonly id?: string;
  readonly text: string;
  readonly symbol?: string;
  readonly path?: string;
  readonly scope?: string;
};

export function prismHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PRISM_HOME?.trim();
  if (override) return override;
  if (useLocalPrismStore(env))
    return join(tmpdir(), `prism-test-home-${process.pid}`);
  return join(homedir(), ".prism");
}

/** True when tests should keep writing into the fixture tree. */
export function useLocalPrismStore(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VITEST === "true" && !env.PRISM_HOME?.trim()) return true;
  if (env.BUN_TEST === "1" && !env.PRISM_HOME?.trim()) return true;
  return false;
}

/** Stable, filesystem-safe key for a workspace root (ADR-0054). */
export function workspaceKey(workspaceRoot: string): string {
  return createHash("sha256")
    .update(resolve(workspaceRoot))
    .digest("hex")
    .slice(0, 24);
}

/** Pre-migration location: `{repo}/.prism`. */
export function legacyRepoPrismDir(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".prism");
}

/** Pre-unification jobs folder: `~/.prism/dispatch/workspaces/<key>`. */
export function legacyGlobalJobsDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(
    prismHomeDir(env),
    "dispatch",
    "workspaces",
    workspaceKey(workspaceRoot),
  );
}

/**
 * Per-repo Prism state. Tests without `PRISM_HOME` keep `{repo}/.prism`;
 * everything else uses `~/.prism/workspaces/<key>`.
 */
export function workspacePrismDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (useLocalPrismStore(env)) return legacyRepoPrismDir(workspaceRoot);
  return join(prismHomeDir(env), "workspaces", workspaceKey(workspaceRoot));
}

export function workspaceDispatchDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "dispatch");
}

export function workspaceCacheDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "cache");
}

export function workspaceConfigPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "config.json");
}

export function workspaceFindingMutesPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "finding-mutes.json");
}

export function workspaceNotesDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspaceDispatchDir(workspaceRoot, env), "notes");
}

export function agentsMdPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "agents.md");
}

function skipName(name: string): boolean {
  return name === "." || name === "..";
}

function isPendingWorktrees(src: string, name: string): boolean {
  return name === "worktrees" && basename(src) === "dispatch";
}

/** Job migrator still reads these leftover files after the rest is copied. */
const PENDING_JOB_FILES = new Set(["jobs.json", "jobs.json.migrated"]);
const PENDING_DISPATCH_DIRS = new Set(["worktrees"]);

function copyMissingSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (skipName(name) || isPendingWorktrees(src, name)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    const st = statSync(from);
    if (st.isDirectory()) {
      copyMissingSync(from, to);
      continue;
    }
    if (!existsSync(to)) {
      mkdirSync(dest, { recursive: true });
      cpSync(from, to);
    }
  }
}

async function copyMissing(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  for (const name of await readdir(src)) {
    if (skipName(name) || isPendingWorktrees(src, name)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    const st = await stat(from);
    if (st.isDirectory()) {
      await copyMissing(from, to);
      continue;
    }
    try {
      await stat(to);
    } catch {
      await cp(from, to);
    }
  }
}

function removeCopiedLeftoverSync(leftover: string): void {
  if (!existsSync(leftover)) return;
  for (const name of readdirSync(leftover)) {
    if (skipName(name)) continue;
    const from = join(leftover, name);
    if (name === "dispatch" && statSync(from).isDirectory()) {
      for (const inner of readdirSync(from)) {
        if (PENDING_JOB_FILES.has(inner) || PENDING_DISPATCH_DIRS.has(inner)) {
          continue;
        }
        rmSync(join(from, inner), { recursive: true, force: true });
      }
      const left = readdirSync(from).filter((inner) => !skipName(inner));
      if (left.length === 0) rmSync(from, { recursive: true, force: true });
      continue;
    }
    rmSync(from, { recursive: true, force: true });
  }
  const left = readdirSync(leftover).filter((name) => !skipName(name));
  if (left.length === 0) rmSync(leftover, { recursive: true, force: true });
}

async function removeCopiedLeftover(leftover: string): Promise<void> {
  try {
    await stat(leftover);
  } catch {
    return;
  }
  for (const name of await readdir(leftover)) {
    if (skipName(name)) continue;
    const from = join(leftover, name);
    const st = await stat(from).catch(() => undefined);
    if (name === "dispatch" && st?.isDirectory()) {
      for (const inner of await readdir(from)) {
        if (PENDING_JOB_FILES.has(inner) || PENDING_DISPATCH_DIRS.has(inner)) {
          continue;
        }
        await rm(join(from, inner), { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
      const left = (await readdir(from).catch(() => [])).filter(
        (inner) => !skipName(inner),
      );
      if (left.length === 0) {
        await rm(from, { recursive: true, force: true }).catch(() => undefined);
      }
      continue;
    }
    await rm(from, { recursive: true, force: true }).catch(() => undefined);
  }
  const left = (await readdir(leftover).catch(() => [])).filter(
    (name) => !skipName(name),
  );
  if (left.length === 0) {
    await rm(leftover, { recursive: true, force: true }).catch(() => undefined);
  }
}

function liftLegacyJobsSync(
  workspaceRoot: string,
  dest: string,
  env: NodeJS.ProcessEnv,
): void {
  const from = join(legacyGlobalJobsDir(workspaceRoot, env), "jobs.json");
  const to = join(dest, "dispatch", "jobs.json");
  if (!existsSync(from) || existsSync(to)) return;
  mkdirSync(join(dest, "dispatch"), { recursive: true });
  cpSync(from, to);
  const metaFrom = join(legacyGlobalJobsDir(workspaceRoot, env), "meta.json");
  const metaTo = join(dest, "dispatch", "meta.json");
  if (existsSync(metaFrom) && !existsSync(metaTo)) cpSync(metaFrom, metaTo);
}

async function liftLegacyJobs(
  workspaceRoot: string,
  dest: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const from = join(legacyGlobalJobsDir(workspaceRoot, env), "jobs.json");
  const to = join(dest, "dispatch", "jobs.json");
  try {
    await stat(from);
  } catch {
    return;
  }
  try {
    await stat(to);
    return;
  } catch {
    /* dest jobs missing */
  }
  await mkdir(join(dest, "dispatch"), { recursive: true });
  await cp(from, to);
  const metaFrom = join(legacyGlobalJobsDir(workspaceRoot, env), "meta.json");
  const metaTo = join(dest, "dispatch", "meta.json");
  try {
    await stat(metaFrom);
    try {
      await stat(metaTo);
    } catch {
      await cp(metaFrom, metaTo);
    }
  } catch {
    /* no meta */
  }
}

/**
 * Lift `{repo}/.prism` and the ADR-0054 jobs folder into
 * `~/.prism/workspaces/<key>/`, then remove the checkout copy.
 */
export function ensureWorkspacePrismSync(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const dest = workspacePrismDir(workspaceRoot, env);
  if (useLocalPrismStore(env)) {
    mkdirSync(dest, { recursive: true });
    return dest;
  }
  mkdirSync(dest, { recursive: true });
  const leftover = legacyRepoPrismDir(workspaceRoot);
  if (existsSync(leftover) && resolve(leftover) !== resolve(dest)) {
    copyMissingSync(leftover, dest);
    removeCopiedLeftoverSync(leftover);
  }
  liftLegacyJobsSync(workspaceRoot, dest, env);
  return dest;
}

export async function ensureWorkspacePrism(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const dest = workspacePrismDir(workspaceRoot, env);
  if (useLocalPrismStore(env)) {
    await mkdir(dest, { recursive: true });
    return dest;
  }
  await mkdir(dest, { recursive: true });
  const leftover = legacyRepoPrismDir(workspaceRoot);
  try {
    await stat(leftover);
    if (resolve(leftover) !== resolve(dest)) {
      await copyMissing(leftover, dest);
      await relocatePrismWorktrees(workspaceRoot, env);
      await removeCopiedLeftover(leftover);
    }
  } catch {
    /* no checkout .prism */
  }
  await liftLegacyJobs(workspaceRoot, dest, env);
  return dest;
}

/** Best-effort `git worktree move` after files were copied into dest. */
export async function relocatePrismWorktrees(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (useLocalPrismStore(env)) return;
  const destTrees = join(workspaceDispatchDir(workspaceRoot, env), "worktrees");
  const leftoverTrees = join(
    legacyRepoPrismDir(workspaceRoot),
    "dispatch",
    "worktrees",
  );
  try {
    await stat(leftoverTrees);
  } catch {
    return;
  }
  await mkdir(destTrees, { recursive: true });
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  for (const name of await readdir(leftoverTrees)) {
    if (skipName(name)) continue;
    const from = join(leftoverTrees, name);
    const to = join(destTrees, name);
    try {
      await stat(to);
      continue;
    } catch {
      /* dest missing */
    }
    try {
      await run("git", ["worktree", "move", from, to], {
        cwd: workspaceRoot,
      });
    } catch {
      try {
        await rename(from, to);
      } catch {
        /* leave in place */
      }
    }
  }
}

/** Drop leftover `<repo>/.prism` after job files have been merged. */
export async function removeLeftoverRepoPrism(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (useLocalPrismStore(env)) return;
  const leftover = legacyRepoPrismDir(workspaceRoot);
  if (resolve(leftover) === resolve(workspacePrismDir(workspaceRoot, env))) {
    return;
  }
  const liveJobs = join(leftover, "dispatch", "jobs.json");
  try {
    await stat(liveJobs);
    return;
  } catch {
    /* merged */
  }
  const leftoverTrees = join(leftover, "dispatch", "worktrees");
  try {
    const names = (await readdir(leftoverTrees)).filter(
      (name) => !skipName(name),
    );
    if (names.length > 0) return;
  } catch {
    /* no leftover worktrees */
  }
  await rm(leftover, { recursive: true, force: true }).catch(() => undefined);
}

/** Memories (M-091): `workspaces/<key>/memory.json`, no longer under Dispatch. */
export function workspaceMemoryPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "memory.json");
}

/** Where Dispatch kept memories before M-091. */
export function legacyWorkspaceMemoryPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspaceDispatchDir(workspaceRoot, env), "memory.json");
}

/** Move a pre-M-091 memory file to its new home once. Never overwrites. */
export function migrateLegacyMemoryFile(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  renameIfMissing(
    legacyWorkspaceMemoryPath(workspaceRoot, env),
    workspaceMemoryPath(workspaceRoot, env),
  );
}

function parseMemoryFile(raw: string): WorkspaceMemory[] {
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const rec = row as Record<string, unknown>;
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      if (!text) return [];
      return [
        {
          ...(typeof rec.id === "string" ? { id: rec.id } : {}),
          text,
          ...(typeof rec.symbol === "string" ? { symbol: rec.symbol } : {}),
          ...(typeof rec.path === "string" ? { path: rec.path } : {}),
          ...(typeof rec.scope === "string" ? { scope: rec.scope } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Memories Dispatch stored for this workspace (M-075). Missing file → []. */
export async function loadWorkspaceMemories(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkspaceMemory[]> {
  migrateLegacyMemoryFile(workspaceRoot, env);
  try {
    const raw = await readFile(workspaceMemoryPath(workspaceRoot, env), "utf8");
    return parseMemoryFile(raw);
  } catch {
    return [];
  }
}

/**
 * Rewrite stored `symbol` / `path` anchors after a rename is applied.
 * Returns how many items changed. Missing file → 0.
 */
export async function migrateWorkspaceMemories(
  workspaceRoot: string,
  change: MemoryAnchorChange,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  migrateLegacyMemoryFile(workspaceRoot, env);
  const path = workspaceMemoryPath(workspaceRoot, env);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return 0;
  }
  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(raw) as { items?: unknown };
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed.items)) return 0;
  const items = parsed.items.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object",
  );
  const next = rewriteMemoryAnchors(
    items.map((row) => ({
      ...row,
      ...(typeof row.symbol === "string" ? { symbol: row.symbol } : {}),
      ...(typeof row.path === "string" ? { path: row.path } : {}),
    })),
    change,
  );
  let changed = 0;
  for (let i = 0; i < items.length; i += 1) {
    const before = items[i]!;
    const after = next[i]!;
    if (before.symbol !== after.symbol || before.path !== after.path) {
      changed += 1;
    }
  }
  if (changed === 0) return 0;
  await writeFile(
    path,
    `${JSON.stringify({ items: next }, null, 2)}\n`,
    "utf8",
  );
  return changed;
}

async function readMemoryRows(
  path: string,
): Promise<Record<string, unknown>[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      items?: unknown;
    };
    return Array.isArray(parsed.items)
      ? parsed.items.filter(
          (row): row is Record<string, unknown> =>
            Boolean(row) && typeof row === "object",
        )
      : [];
  } catch {
    return [];
  }
}

async function writeMemoryRows(
  path: string,
  items: readonly Record<string, unknown>[],
): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify({ items }, null, 2)}\n`, "utf8");
}

/** Save one memory. Same row shape Dispatch wrote, so old files stay valid. */
export async function rememberWorkspaceMemory(
  workspaceRoot: string,
  input: {
    readonly text: string;
    readonly scope?: string;
    readonly symbol?: string;
    readonly path?: string;
    readonly source?: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkspaceMemory> {
  migrateLegacyMemoryFile(workspaceRoot, env);
  const path = workspaceMemoryPath(workspaceRoot, env);
  const item = {
    id: createHash("sha256")
      .update(`${Date.now()}:${Math.random()}:${input.text}`)
      .digest("hex")
      .slice(0, 12),
    scope: input.scope ?? "repo",
    text: input.text.trim(),
    source: input.source ?? "user",
    createdAt: new Date().toISOString(),
    ...(input.symbol?.trim() ? { symbol: input.symbol.trim() } : {}),
    ...(input.path?.trim() ? { path: input.path.trim() } : {}),
  };
  await writeMemoryRows(path, [...(await readMemoryRows(path)), item]);
  return item;
}

/** Forget memories by exact id, or by a case-insensitive text match. */
export async function forgetWorkspaceMemory(
  workspaceRoot: string,
  idOrText: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  migrateLegacyMemoryFile(workspaceRoot, env);
  const path = workspaceMemoryPath(workspaceRoot, env);
  const needle = idOrText.trim().toLowerCase();
  if (!needle) return 0;
  const items = await readMemoryRows(path);
  const next = items.filter(
    (row) =>
      row.id !== idOrText.trim() &&
      !(
        typeof row.text === "string" && row.text.toLowerCase().includes(needle)
      ),
  );
  const removed = items.length - next.length;
  if (removed > 0) await writeMemoryRows(path, next);
  return removed;
}

export function renameIfMissing(from: string, to: string): void {
  if (!existsSync(from) || existsSync(to)) return;
  mkdirSync(join(to, ".."), { recursive: true });
  try {
    renameSync(from, to);
  } catch {
    /* ignore */
  }
}
