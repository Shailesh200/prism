/**
 * How every Prism launcher finds the MCP binary (plan §2.2).
 *
 * Order: `PRISM_MCP_BIN` → `~/.prism/install.json` `bin` → `prism-mcp` on
 * PATH → pack-relative dev build. Never `npx`: a launcher that cannot find a
 * binary reports `install.missing_bin` and does nothing. The plugin hook
 * carries a zero-dependency copy of this order; `prism-bin.contract.test.ts`
 * runs both against the same fixtures.
 *
 * Import from `@repo-prism/shared/prism-bin`; this file uses `node:fs`.
 */
import {
  accessSync,
  constants,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { z } from "zod";
import { prismHomeDir } from "./prism-home.js";

export const InstallRecordSchema = z
  .object({
    version: z.string().min(1),
    /** Absolute path of the `prism-mcp` launcher this install put down. */
    bin: z.string().min(1),
    /** First install; kept across re-installs and upgrades. */
    installedAt: z.string().min(1),
    /** Last install or upgrade. */
    updatedAt: z.string().min(1).optional(),
    /** Agent hosts `prism install` wrote configs for. */
    hosts: z.array(z.string().min(1)),
    /** `user` or `project` (plan §2.1). */
    scope: z.enum(["user", "project"]).optional(),
    /** Repository the project-scope files went into. */
    root: z.string().min(1).optional(),
    /** `--local` checkout the binaries come from (local builds only). */
    source: z.string().min(1).optional(),
    /** Last run's backup folder (`~/.prism-backups/<UTC stamp>`), when it made one. */
    backupDir: z.string().min(1).optional(),
    /** Everything install wrote, so uninstall removes exactly that. */
    files: z
      .array(
        z.union([
          // `created`: Prism made the file, so uninstall may delete it when
          // nothing else is left. `existingDepth` / `hadHooks`: what of the
          // key path was the user's before install (kept on uninstall).
          z
            .object({
              kind: z.literal("json-key"),
              path: z.string(),
              key: z.array(z.string()),
              created: z.boolean().optional(),
              existingDepth: z.number().int().nonnegative().optional(),
            })
            .strict(),
          z
            .object({
              kind: z.literal("claude-hooks"),
              path: z.string(),
              created: z.boolean().optional(),
              hadHooks: z.boolean().optional(),
            })
            .strict(),
          z
            .object({
              kind: z.literal("block"),
              path: z.string(),
              marker: z.enum(["md", "toml"]),
              created: z.boolean().optional(),
            })
            .strict(),
          z
            .object({
              kind: z.literal("file"),
              path: z.string(),
              created: z.boolean().optional(),
            })
            .strict(),
        ]),
      )
      .optional(),
  })
  .strict();
export type InstallRecord = z.infer<typeof InstallRecordSchema>;

export type PrismBinSource = "env" | "install-json" | "path" | "pack";
export type PrismBinResolution =
  | { readonly ok: true; readonly bin: string; readonly source: PrismBinSource }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly tried: readonly string[];
    };

export function installRecordPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(prismHomeDir(env), "install.json");
}

export type InstallRecordRead =
  | { readonly kind: "ok"; readonly record: InstallRecord }
  | { readonly kind: "missing" }
  | { readonly kind: "invalid"; readonly reason: string };

export function readInstallRecord(
  env: NodeJS.ProcessEnv = process.env,
): InstallRecordRead {
  const path = installRecordPath(env);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { kind: "missing" };
    return { kind: "invalid", reason: `${path}: ${(error as Error).message}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { kind: "invalid", reason: `${path}: ${(error as Error).message}` };
  }
  const parsed = InstallRecordSchema.safeParse(raw);
  return parsed.success
    ? { kind: "ok", record: parsed.data }
    : {
        kind: "invalid",
        reason: `${path}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      };
}

export function writeInstallRecord(
  record: InstallRecord,
  env: NodeJS.ProcessEnv = process.env,
): void {
  mkdirSync(prismHomeDir(env), { recursive: true, mode: 0o700 });
  writeFileSync(
    installRecordPath(env),
    `${JSON.stringify(InstallRecordSchema.parse(record), null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
}

/** A `.js`/`.mjs`/`.cjs` build runs through node, so it only has to exist. */
export function isNodeScript(path: string): boolean {
  return /\.[cm]?js$/.test(path);
}

function executable(path: string): boolean {
  try {
    accessSync(
      path,
      process.platform === "win32" || isNodeScript(path)
        ? constants.F_OK
        : constants.X_OK,
    );
    return true;
  } catch {
    return false; // not executable is the answer, not a failure
  }
}

function onPath(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const exts =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];
  for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, `${name}${ext.toLowerCase()}`);
      if (executable(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * `packCandidates` are dev-only fallbacks, e.g. the built `bin.js` next to a
 * plugin pack. They are tried last and only if they exist.
 */
export function resolvePrismBin(
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly packCandidates?: readonly string[];
  } = {},
): PrismBinResolution {
  const env = options.env ?? process.env;
  const tried: string[] = [];
  const fromEnv = env.PRISM_MCP_BIN?.trim();
  if (fromEnv) {
    if (executable(fromEnv)) return { ok: true, bin: fromEnv, source: "env" };
    tried.push(`PRISM_MCP_BIN=${fromEnv} (not executable)`);
  }
  const install = readInstallRecord(env);
  if (install.kind === "ok") {
    if (executable(install.record.bin)) {
      return { ok: true, bin: install.record.bin, source: "install-json" };
    }
    tried.push(`install.json bin ${install.record.bin} (not executable)`);
  } else if (install.kind === "invalid") {
    tried.push(`install.json invalid: ${install.reason}`);
  }
  const path = onPath("prism-mcp", env);
  if (path) return { ok: true, bin: path, source: "path" };
  tried.push("prism-mcp not on PATH");
  for (const candidate of options.packCandidates ?? []) {
    if (executable(candidate))
      return { ok: true, bin: candidate, source: "pack" };
    tried.push(`${candidate} (missing)`);
  }
  return { ok: false, reason: "install.missing_bin", tried };
}
