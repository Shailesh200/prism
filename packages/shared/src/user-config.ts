/**
 * `~/.prism/config.json`: user-level settings that apply to every workspace
 * (plan §0.3, COV-19): `extraTools[]`, the opt-in MCP tools registered on top
 * of the default nine, and `strength` (plan P5). The old all-tools environment switch is gone (§0.4 #25).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  parsePrismConfig,
  PRISM_CONFIG_RELATIVE_PATH,
  StrengthSchema,
  type Strength,
} from "./prism-config.js";
import { z } from "zod";
import { prismHomeDir } from "./prism-home.js";
import { PrismErrorCode, prismError, type PrismError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

export { STRENGTHS, StrengthSchema, type Strength } from "./prism-config.js";

export const UserConfigSchema = z
  .object({
    extraTools: z.array(z.string().min(1)).optional(),
    strength: StrengthSchema.optional(),
  })
  .strict();
export type UserConfig = z.infer<typeof UserConfigSchema>;

export function userConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHomeDir(env), "config.json");
}

/** Missing file → `{}`. Unreadable or invalid → an error the caller must surface. */
export function loadUserConfigSync(
  env: NodeJS.ProcessEnv = process.env,
): Result<UserConfig, PrismError> {
  const path = userConfigPath(env);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return ok({});
    return err(
      prismError(
        PrismErrorCode.IO_ERROR,
        `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  const parsed = UserConfigSchema.safeParse(json);
  if (!parsed.success) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Invalid ${path}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
      ),
    );
  }
  return ok(parsed.data);
}

/**
 * Tool names from `PRISM_EXTRA_TOOLS` (comma-separated). A hand-written MCP
 * entry can turn on `receipt` without a second config file. Empty when unset.
 */
export function extraToolsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.PRISM_EXTRA_TOOLS;
  if (typeof raw !== "string" || raw.trim() === "") return [];
  const names: string[] = [];
  for (const part of raw.split(",")) {
    const name = part.trim();
    if (name.length > 0 && !names.includes(name)) names.push(name);
  }
  return names;
}

export type StrengthSource = "repo" | "user" | "default";

/** `{root}/.prism/config.json`, the per-repository override file. */
export function repoConfigPath(root: string): string {
  return join(root, PRISM_CONFIG_RELATIVE_PATH);
}

function readJsonObject(
  path: string,
): Result<Record<string, unknown>, PrismError> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return ok({});
    return err(
      prismError(
        PrismErrorCode.IO_ERROR,
        `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return err(
      prismError(PrismErrorCode.VALIDATION, `${path} must hold a JSON object`),
    );
  }
  return ok(json as Record<string, unknown>);
}

/**
 * The strength in effect for `root` (plan P5): the repository's
 * `.prism/config.json` wins over `~/.prism/config.json`; default `full`.
 * `prism-hook.mjs` mirrors this order.
 */
export function resolveStrength(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Result<
  { readonly strength: Strength; readonly source: StrengthSource },
  PrismError
> {
  const repo = readJsonObject(repoConfigPath(root));
  if (!repo.ok) return repo;
  const repoConfig = parsePrismConfig(repo.value);
  if (!repoConfig.ok) return repoConfig;
  if (repoConfig.value.strength) {
    return ok({ strength: repoConfig.value.strength, source: "repo" });
  }
  const user = loadUserConfigSync(env);
  if (!user.ok) return user;
  if (user.value.strength)
    return ok({ strength: user.value.strength, source: "user" });
  return ok({ strength: "full", source: "default" });
}

/** Write `strength` into the user or repository config, keeping every other key. */
export function setStrength(
  strength: Strength,
  target:
    | { readonly scope: "user" }
    | { readonly scope: "repo"; readonly root: string },
  env: NodeJS.ProcessEnv = process.env,
): Result<{ readonly path: string }, PrismError> {
  const path =
    target.scope === "repo" ? repoConfigPath(target.root) : userConfigPath(env);
  const current = readJsonObject(path);
  if (!current.ok) return current;
  const next = { ...current.value, strength };
  const valid =
    target.scope === "repo"
      ? parsePrismConfig(next)
      : UserConfigSchema.safeParse(next).success
        ? ok(next)
        : err(
            prismError(
              PrismErrorCode.VALIDATION,
              `Invalid ${path}; fix it before setting strength`,
            ),
          );
  if (!valid.ok) return valid;
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temp, path);
  return ok({ path });
}
