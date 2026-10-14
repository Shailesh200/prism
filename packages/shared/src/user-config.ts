/**
 * `~/.prism/config.json`: user-level settings that apply to every workspace
 * (plan §0.3, COV-19). Today that is only `extraTools[]`, the opt-in MCP tools
 * registered on top of the default nine. The old all-tools environment switch is gone (§0.4 #25).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { prismHomeDir } from "./prism-home.js";
import { PrismErrorCode, prismError, type PrismError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

export const UserConfigSchema = z
  .object({
    extraTools: z.array(z.string().min(1)).optional(),
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
