/**
 * The hook snapshot (ADR-0058 §2, M-079 phase 3).
 *
 * Session-start and before-edit hooks have a ~300 ms budget, which rules out
 * opening the index. They read this file instead: a few facts Prism wrote the
 * last time it indexed. A hook that finds no snapshot, or one whose `headSha`
 * no longer matches the checkout, stays silent — it never waits on an index.
 *
 * The plugin's zero-dependency hook script (`packages/plugin/hooks`) reads the
 * same shape; a contract test runs that script against this writer.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { PrismWorkspace } from "@repo-prism/core";
import { readLastPrepareChange } from "@repo-prism/core/envelope";
import {
  isAcceptedWorkOrderVetoAdr,
  isFixturePath,
  offLimitReason,
} from "@repo-prism/shared";
import { readGitHead } from "@repo-prism/shared/git-head";
import { recordEvent } from "@repo-prism/shared/events";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { daemonBuildId } from "../daemon-attach.js";

/** v2 adds the index identity (plan §2.4). A hook ignores any other version. */
export const HOOK_SNAPSHOT_VERSION = 2;

export type HookPathRow = { readonly path: string; readonly reason: string };

export type HookSnapshot = {
  readonly version: typeof HOOK_SNAPSHOT_VERSION;
  readonly workspace: string;
  readonly generatedAt: string;
  /**
   * Index identity (plan §2.4). A hook whose checkout HEAD differs from
   * `headSha` treats the snapshot as stale and stays silent.
   */
  readonly schemaVersion: typeof HOOK_SNAPSHOT_VERSION;
  readonly buildId: string;
  readonly headSha: string | null;
  readonly branch: string | null;
  /** Increases by one on every write for this workspace. */
  readonly generation: number;
  readonly indexedAt: string;
  /** Injected at session start. Small by construction (see ORIENTATION_MAX). */
  readonly orientation: string;
  /** Generated or vendor files, plus `vendor/` directories (prefix match). */
  readonly offLimits: readonly HookPathRow[];
  /** High-blast files: the hook warns before an edit. */
  readonly needsSignOff: readonly HookPathRow[];
  /** True only when an Accepted ADR armed the write veto (ADR-0056). */
  readonly hookArmed: boolean;
};

export const ORIENTATION_MAX = 1_400;
const OFF_LIMITS_CAP = 5_000;
const SIGN_OFF_CANDIDATES = 40;
const SIGN_OFF_RISK = 60;
const ADR_FILE =
  /(?:^|\/)(?:plans\/adr\/|docs\/adr\/|adr\/)|(?:^|\/)ADR-\d{4}/i;

export function hookSnapshotPath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "hooks", "snapshot.json");
}

function vendorDir(path: string): string | null {
  const match = /^(.*?(?:^|\/)vendor)(?:\/|$)/i.exec(path);
  return match?.[1] ?? null;
}

async function hookArmed(workspace: PrismWorkspace, paths: readonly string[]) {
  for (const path of paths) {
    if (!ADR_FILE.test(path)) continue;
    let text: string;
    try {
      text = await readFile(join(workspace.rootPath, path), "utf8");
    } catch (error) {
      // An unreadable ADR cannot arm anything, but the reason is kept.
      recordEvent({
        event: "snapshot.adr_unreadable",
        outcome: "degraded",
        reason: error instanceof Error ? error.message : String(error),
        workspace: workspace.rootPath,
      });
      continue;
    }
    if (isAcceptedWorkOrderVetoAdr(text.slice(0, 256_000))) return true;
  }
  return false;
}

/** Files whose blast risk is High, chosen from the most imported files. */
async function highBlastFiles(
  workspace: PrismWorkspace,
): Promise<HookPathRow[]> {
  const graph = workspace.getDependencyGraph();
  if (!graph.ok) return [];
  const fanIn = new Map<string, number>();
  for (const edge of graph.value.edges) {
    if (!edge.to.startsWith("file:") || !edge.from.startsWith("file:"))
      continue;
    const to = edge.to.slice("file:".length);
    if (isFixturePath(to)) continue;
    fanIn.set(to, (fanIn.get(to) ?? 0) + 1);
  }
  const candidates = [...fanIn.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SIGN_OFF_CANDIDATES);
  const rows: HookPathRow[] = [];
  for (const [path] of candidates) {
    const blast = await workspace.blastRadius({ kind: "file", id: path });
    if (!blast.ok || blast.value.risk < SIGN_OFF_RISK) continue;
    rows.push({
      path,
      reason: `high blast — ${blast.value.affectedFiles.length} dependents, risk ${Math.round(blast.value.risk)}`,
    });
  }
  return rows;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const PACKAGES_SHOWN = 8;

async function orientationText(
  workspace: PrismWorkspace,
  paths: readonly string[],
  offLimits: number,
  signOff: number,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const lines: string[] = [];
  const dna = await workspace.getDna();
  const name = basename(workspace.rootPath);
  const identity: string[] = [];
  if (dna.ok) {
    const languages = dna.value.languages
      .filter((l) => l.share >= 0.05)
      .map((l) => l.id);
    if (languages.length > 0) identity.push(languages.join(" + "));
    if (dna.value.packageManager) identity.push(dna.value.packageManager);
    if (dna.value.testRunners.length > 0) {
      identity.push(`tests with ${dna.value.testRunners.join(", ")}`);
    }
  }
  const packages = paths
    .filter((p) => p.endsWith("/package.json"))
    .map((p) => p.replace(/\/package\.json$/, ""))
    .sort();
  if (packages.length > 0) {
    identity.push(
      `${packages.length} ${packages.length === 1 ? "package" : "packages"}`,
    );
  }
  lines.push(
    identity.length > 0
      ? `Prism · ${name}: ${identity.join(" · ")}.`
      : `Prism · ${name}.`,
  );
  if (packages.length > 0) {
    const more = packages.length - PACKAGES_SHOWN;
    lines.push(
      `Packages: ${packages.slice(0, PACKAGES_SHOWN).join(", ")}${more > 0 ? `, and ${more} more` : ""}.`,
    );
  }
  if (offLimits > 0 || signOff > 0) {
    const parts = [
      offLimits > 0
        ? `${offLimits} generated or vendor ${offLimits === 1 ? "path" : "paths"}`
        : null,
      signOff > 0
        ? `${signOff} high-blast ${signOff === 1 ? "file" : "files"}`
        : null,
    ].filter(Boolean);
    lines.push(`Prism warns before you edit ${parts.join(" or ")}.`);
  }
  const last = await readLastPrepareChange(workspace.rootPath, env).catch(
    (error: unknown) => {
      recordEvent(
        {
          event: "snapshot.last_prepare_unreadable",
          outcome: "degraded",
          reason: error instanceof Error ? error.message : String(error),
          workspace: workspace.rootPath,
        },
        { env },
      );
      return undefined;
    },
  );
  if (last && last.packFiles.length > 0) {
    lines.push(
      `Last Prepare (${clip(last.task, 80)}): ${last.packFiles
        .slice(0, 8)
        .map((file) => file.path)
        .join(", ")}.`,
    );
  }
  lines.push(
    "When you stop, Prism runs the checks this change reaches and prints a receipt.",
  );
  return clip(lines.join("\n"), ORIENTATION_MAX);
}

async function previousGeneration(path: string): Promise<number> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  try {
    const value = (JSON.parse(text) as { generation?: unknown }).generation;
    return typeof value === "number" && Number.isInteger(value) ? value : 0;
  } catch {
    return 0; // a torn or older file restarts the count; it is about to be replaced
  }
}

export async function buildHookSnapshot(
  workspace: PrismWorkspace,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HookSnapshot | null> {
  const index = workspace.getIndex();
  if (!index.ok) return null;
  // Fixtures are test data: editing them is normal, and they are not the repo.
  const paths = index.value.files
    .map((f) => f.path)
    .filter((p) => !isFixturePath(p));

  const offLimits: HookPathRow[] = [];
  const vendorDirs = new Set<string>();
  for (const path of paths) {
    const reason = offLimitReason(path);
    if (!reason) continue;
    const dir = reason === "vendor" ? vendorDir(path) : null;
    if (dir) {
      vendorDirs.add(dir);
      continue;
    }
    offLimits.push({ path, reason });
  }
  const rows = [
    ...[...vendorDirs]
      .sort()
      .map((path) => ({ path: `${path}/`, reason: "vendor" })),
    ...offLimits.sort((a, b) => a.path.localeCompare(b.path)),
  ].slice(0, OFF_LIMITS_CAP);

  const needsSignOff = await highBlastFiles(workspace);
  const head = readGitHead(workspace.rootPath);
  const generation =
    (await previousGeneration(hookSnapshotPath(workspace.rootPath, env))) + 1;
  return {
    version: HOOK_SNAPSHOT_VERSION,
    workspace: workspace.rootPath,
    generatedAt: new Date().toISOString(),
    schemaVersion: HOOK_SNAPSHOT_VERSION,
    buildId: daemonBuildId(),
    headSha: head?.sha ?? null,
    branch: head?.branch ?? null,
    generation,
    indexedAt: index.value.indexedAt,
    orientation: await orientationText(
      workspace,
      paths,
      rows.length,
      needsSignOff.length,
      env,
    ),
    offLimits: rows,
    needsSignOff,
    hookArmed: await hookArmed(workspace, paths),
  };
}

/** Writes the snapshot and records the outcome; never throws. */
export async function refreshHookSnapshot(
  workspace: PrismWorkspace,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const started = Date.now();
  try {
    const written = await writeHookSnapshot(workspace, env);
    recordEvent(
      written
        ? {
            event: "snapshot.write",
            outcome: "ok",
            workspace: workspace.rootPath,
            durationMs: Date.now() - started,
          }
        : {
            event: "snapshot.write",
            outcome: "skipped",
            reason: "no index",
            workspace: workspace.rootPath,
          },
      { env },
    );
  } catch (error) {
    recordEvent(
      {
        event: "snapshot.write",
        outcome: "error",
        reason: error instanceof Error ? error.message : String(error),
        workspace: workspace.rootPath,
      },
      { env },
    );
  }
}

/** Atomic write so a hook never reads half a file. */
export async function writeHookSnapshot(
  workspace: PrismWorkspace,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HookSnapshot | null> {
  const snapshot = await buildHookSnapshot(workspace, env);
  if (!snapshot) return null;
  const path = hookSnapshotPath(workspace.rootPath, env);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(snapshot)}\n`, "utf8");
  await rename(tmp, path);
  return snapshot;
}
