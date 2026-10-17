/**
 * Installing 2.0 over 1.x data in `~/.prism` (plan §3.1a, WIPE-1…8).
 *
 * 1.x is never migrated. Nothing is deleted (round 5, consent): every 1.x
 * entry moves to `~/.prism-backups/<stamp>/1x/`; valid custom lenses and
 * valid config keys are written back for 2.x, and invalid lens files stay
 * in the backup only (`lenses-not-compatible/REMOVED.txt`).
 * `version.json {major:2}` makes the step idempotent.
 */
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  accessSync,
  constants,
} from "node:fs";
import { dirname, join } from "node:path";
import { backupDir, moveInto, stamp, tilde } from "./backups.js";
import { CONSENT_COPY } from "./consent-copy.js";
import { LensDefinitionSchema, type LensDefinition } from "@repo-prism/shared";
import { recordEvent } from "@repo-prism/shared/events";
import { prismHomeDir } from "@repo-prism/shared/prism-home";
import { UserConfigSchema } from "@repo-prism/shared/user-config";

export const VERSION_FILE = "version.json";

export type WipeOutcome =
  | { readonly kind: "clean" } // no ~/.prism: version.json written, no line
  | { readonly kind: "current" } // already 2.x: nothing done
  | {
      readonly kind: "wiped";
      readonly line: string;
      readonly removed: readonly string[];
      readonly keptLenses: number;
      readonly invalidLenses: number;
      readonly droppedConfigKeys: readonly string[];
      /** Where the 1.x data went (`~/.prism-backups/<stamp>/1x`). */
      readonly backupDir: string;
      readonly removedDir?: string;
    }
  | {
      readonly kind: "permission";
      readonly path: string;
      readonly fix: string;
    };

type Lstat = ReturnType<typeof lstatSync>;
function stat(path: string): Lstat | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function versionMajor(home: string): number | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(home, VERSION_FILE), "utf8")) as {
      major?: unknown;
    };
    return typeof raw.major === "number" ? raw.major : undefined;
  } catch (error) {
    // Missing or unreadable version.json means "not 2.x": that is the answer.
    if (error instanceof SyntaxError) return undefined;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function writeVersionFile(home: string, now: Date): void {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(home, VERSION_FILE),
    `${JSON.stringify({ major: 2, installedAt: now.toISOString() }, null, 2)}\n`,
  );
}

/**
 * Every path the wipe would change must be writable (WIPE-7): check them all
 * before touching anything, so a permission error never leaves mixed data.
 */
function firstUnwritable(home: string): string | undefined {
  const check = (path: string): string | undefined => {
    try {
      accessSync(path, constants.W_OK);
      return undefined;
    } catch {
      return path; // not writable is the finding, reported to the caller
    }
  };
  const top = check(home);
  if (top) return top;
  for (const name of readdirSync(home)) {
    const path = join(home, name);
    const info = stat(path);
    if (!info || info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      const bad = check(path);
      if (bad) return bad;
    }
  }
  return undefined;
}

type LensRead = {
  readonly valid: LensDefinition[];
  readonly invalid: { readonly file: string; readonly reason: string }[];
};

function readLensFiles(dir: string): LensRead {
  const valid: LensDefinition[] = [];
  const invalid: { file: string; reason: string }[] = [];
  const info = stat(dir);
  if (!info || !info.isDirectory() || info.isSymbolicLink())
    return { valid, invalid };
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = join(dir, name);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      invalid.push({
        file,
        reason: `unreadable JSON: ${(error as Error).message}`,
      });
      continue;
    }
    const entries = Array.isArray(raw)
      ? raw
      : raw &&
          typeof raw === "object" &&
          Array.isArray((raw as { lenses?: unknown }).lenses)
        ? (raw as { lenses: unknown[] }).lenses
        : [raw];
    const reasons: string[] = [];
    const bad: unknown[] = [];
    for (const entry of entries) {
      const parsed = LensDefinitionSchema.safeParse(entry);
      if (parsed.success) valid.push(parsed.data);
      else {
        bad.push(entry);
        const id =
          entry && typeof entry === "object" && "id" in entry
            ? String((entry as { id: unknown }).id)
            : "(no id)";
        reasons.push(
          `${id}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`,
        );
      }
    }
    if (bad.length > 0) invalid.push({ file, reason: reasons.join(" | ") });
  }
  return { valid, invalid };
}

function configKeep(home: string): {
  readonly keep?: Record<string, unknown>;
  readonly dropped: string[];
} {
  const path = join(home, "config.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { dropped: [] };
    return { dropped: ["config.json (unreadable)"] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { dropped: ["config.json (not an object)"] };
  const allowed = Object.keys(UserConfigSchema.shape);
  const keep: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key)) {
      dropped.push(key);
      continue;
    }
    const single = UserConfigSchema.safeParse({ [key]: value });
    if (single.success) keep[key] = value;
    else dropped.push(key);
  }
  return { keep, dropped };
}

export { stamp };

/** What a wipe would do, read without changing anything. */
type Analysis = {
  readonly lenses: LensRead;
  readonly config: ReturnType<typeof configKeep>;
  readonly workspaces: number;
  /** Top-level 1.x entries that move to the backup (lenses and config too). */
  readonly entries: readonly string[];
};

function analyze(home: string): Analysis {
  const lenses = readLensFiles(join(home, "lenses"));
  const config = configKeep(home);
  let workspaces = 0;
  const wsInfo = stat(join(home, "workspaces"));
  if (wsInfo?.isDirectory() && !wsInfo.isSymbolicLink())
    workspaces = readdirSync(join(home, "workspaces")).length;
  const entries = readdirSync(home)
    .filter((name) => !name.startsWith(".removed-1x-"))
    .sort();
  return { lenses, config, workspaces, entries };
}

function customCount(lenses: LensRead): number {
  return lenses.valid.filter((lens) => !lens.seededDefault).length;
}

function keepsConfig(config: Analysis["config"]): boolean {
  return Boolean(config.keep && Object.keys(config.keep).length > 0);
}

/** The 1.x part of `prism start`'s consent list; null when there is no 1.x data. */
export type WipePlan = {
  readonly home: string;
  /** `~/.prism-backups/<stamp>/1x`. */
  readonly backupDir: string;
  readonly entries: readonly string[];
  readonly workspaces: number;
  readonly daemon: boolean;
  readonly hub: boolean;
  readonly customLenses: number;
  readonly keepsConfig: boolean;
  readonly invalidLenses: number;
  readonly droppedConfigKeys: readonly string[];
};

export function planWipe1x(
  options: { readonly env?: NodeJS.ProcessEnv; readonly now?: Date } = {},
): WipePlan | null {
  const env = options.env ?? process.env;
  const home = prismHomeDir(env);
  if (!stat(home)) return null;
  const major = versionMajor(home);
  if (major !== undefined && major >= 2) return null;
  const found = analyze(home);
  return {
    home,
    backupDir: join(backupDir(env, options.now ?? new Date()), "1x"),
    entries: found.entries,
    workspaces: found.workspaces,
    daemon: found.entries.includes("daemon"),
    hub: found.entries.includes("hub"),
    customLenses: customCount(found.lenses),
    keepsConfig: keepsConfig(found.config),
    invalidLenses: found.lenses.invalid.length,
    droppedConfigKeys: found.config.dropped,
  };
}

export type WipeOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: Date;
  /** Stops a running 1.x daemon; returns what happened, for the summary. */
  readonly stopDaemon?: () => Promise<"stopped" | "not_running">;
};

export async function wipe1x(options: WipeOptions = {}): Promise<WipeOutcome> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const home = prismHomeDir(env);
  const homeInfo = stat(home);
  if (!homeInfo) {
    writeVersionFile(home, now);
    return { kind: "clean" };
  }
  const major = versionMajor(home);
  if (major !== undefined && major >= 2) return { kind: "current" };

  const blocked = firstUnwritable(home);
  if (blocked) {
    return {
      kind: "permission",
      path: blocked,
      fix: `sudo chown -R "$(id -un)" "${blocked}" && chmod -R u+w "${blocked}"`,
    };
  }

  const daemon = options.stopDaemon
    ? await options.stopDaemon()
    : "not_running";

  // Lenses: 2.0 keeps `lenses/lenses.json` shape; 1.x might have other files.
  const lensDir = join(home, "lenses");
  const { lenses, config, workspaces: workspaceCount, entries } = analyze(home);
  const backup = join(backupDir(env, now), "1x");

  // Invalid lens files stay in the backup only, with the reason for each.
  let removedDir: string | undefined;
  if (lenses.invalid.length > 0) {
    removedDir = join(backup, "lenses-not-compatible");
    mkdirSync(removedDir, { recursive: true });
    const notes: string[] = [];
    for (const [index, item] of lenses.invalid.entries()) {
      const target = join(
        removedDir,
        `${index}-${item.file.split(/[\\/]/).pop()}`,
      );
      moveInto(item.file, target);
      notes.push(`${target.split(/[\\/]/).pop()}: ${item.reason}`);
    }
    writeFileSync(join(removedDir, "REMOVED.txt"), `${notes.join("\n")}\n`);
  }

  // Move every 1.x entry out, lenses and config included (their 2.x form is
  // written back below). A symlink moves as the link, never followed (WIPE-6).
  const removed: string[] = [];
  for (const name of entries) {
    const path = join(home, name);
    if (!stat(path)) continue;
    moveInto(path, join(backup, name));
    if (name !== "lenses" && name !== "config.json") removed.push(name);
  }

  // Write back what 2.x keeps: valid custom lenses (same content), valid keys.
  if (lenses.valid.length > 0) {
    mkdirSync(lensDir, { recursive: true });
    writeFileSync(
      join(lensDir, "lenses.json"),
      `${JSON.stringify({ lenses: lenses.valid }, null, 2)}\n`,
    );
  }
  if (config.keep) {
    writeFileSync(
      join(home, "config.json"),
      `${JSON.stringify(config.keep, null, 2)}\n`,
    );
  }
  writeVersionFile(home, now);

  const line = CONSENT_COPY.wipeDone({
    backupDir: `${tilde(backup, dirname(home))}/`,
    customLenses: customCount(lenses),
    keepsConfig: keepsConfig(config),
    droppedConfigKeys: config.dropped,
  });
  recordEvent(
    {
      event: "install.wipe_1x",
      outcome: "ok",
      detail: {
        workspaces: workspaceCount,
        removed: removed.join(","),
        keptLenses: lenses.valid.length,
        invalidLenses: lenses.invalid.length,
        droppedConfigKeys: config.dropped.join(","),
        daemon,
      },
    },
    { env, now },
  );
  return {
    kind: "wiped",
    line,
    removed,
    keptLenses: lenses.valid.length,
    invalidLenses: lenses.invalid.length,
    droppedConfigKeys: config.dropped,
    backupDir: backup,
    ...(removedDir ? { removedDir } : {}),
  };
}
