/**
 * Installing 2.0 over 1.x data in `~/.prism` (plan §3.1a, WIPE-1…8).
 *
 * 1.x is never migrated. Derived data is removed, valid custom lenses and
 * valid config keys are kept, invalid lenses go to `.removed-1x-<ts>/` with a
 * `REMOVED.txt`. `version.json {major:2}` makes the step idempotent.
 */
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  accessSync,
  constants,
} from "node:fs";
import { dirname, join } from "node:path";
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

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
}

function tildify(path: string, home: string): string {
  const parent = dirname(home);
  return path.startsWith(parent) && home.endsWith(".prism")
    ? `~${path.slice(parent.length)}`
    : path;
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
  const lenses = readLensFiles(lensDir);
  const config = configKeep(home);

  let workspaceCount = 0;
  const workspaces = join(home, "workspaces");
  const wsInfo = stat(workspaces);
  if (wsInfo?.isDirectory() && !wsInfo.isSymbolicLink())
    workspaceCount = readdirSync(workspaces).length;

  let removedDir: string | undefined;
  if (lenses.invalid.length > 0) {
    removedDir = join(home, `.removed-1x-${stamp(now)}`);
    mkdirSync(removedDir, { recursive: true });
    const notes: string[] = [];
    for (const [index, item] of lenses.invalid.entries()) {
      const target = join(
        removedDir,
        `${index}-${item.file.split(/[\\/]/).pop()}`,
      );
      renameSync(item.file, target);
      notes.push(`${target.split(/[\\/]/).pop()}: ${item.reason}`);
    }
    writeFileSync(join(removedDir, "REMOVED.txt"), `${notes.join("\n")}\n`);
  }

  // Remove everything else except the kept-data holders and removed folders.
  const removed: string[] = [];
  for (const name of readdirSync(home)) {
    if (name.startsWith(".removed-1x-")) continue;
    if (name === "lenses" || name === "config.json") continue;
    const path = join(home, name);
    const info = stat(path);
    if (!info) continue;
    // A symlinked folder is unlinked, never followed (WIPE-6).
    if (info.isSymbolicLink()) rmSync(path, { force: true });
    else rmSync(path, { recursive: true, force: true });
    removed.push(name);
  }

  // Rewrite lenses: valid custom lenses only, byte-identical content.
  const lensInfo = stat(lensDir);
  if (lensInfo?.isSymbolicLink()) rmSync(lensDir, { force: true });
  else if (lensInfo) rmSync(lensDir, { recursive: true, force: true });
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
  } else if (config.dropped.length > 0) {
    rmSync(join(home, "config.json"), { force: true });
  }
  writeVersionFile(home, now);

  const custom = lenses.valid.filter((lens) => !lens.seededDefault).length;
  const cleared = [
    `${workspaceCount} workspace index${workspaceCount === 1 ? "" : "es"}`,
    ...(daemon === "stopped" || removed.includes("daemon") ? ["daemon"] : []),
    ...(removed.includes("hub") ? ["hub"] : []),
  ];
  const kept = [
    `${custom} custom lens${custom === 1 ? "" : "es"}`,
    ...(config.keep && Object.keys(config.keep).length > 0 ? ["config"] : []),
  ];
  const parts = [
    `Prism 2.0: cleared 1.x data (${cleared.join(", ")}); kept ${kept.join(" and ")}`,
  ];
  if (config.dropped.length > 0)
    parts.push(`dropped config keys ${config.dropped.join(", ")}`);
  if (removedDir)
    parts.push(
      `${lenses.invalid.length} lens file${lenses.invalid.length === 1 ? "" : "s"} not 2.0-compatible moved to ${tildify(removedDir, home)}/`,
    );
  const line = `${parts.join("; ")}.`;
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
    ...(removedDir ? { removedDir } : {}),
  };
}
