/**
 * Load `.prism/config.json` for a workspace root (M-057 P-B6).
 * Missing file → empty config. Invalid JSON / schema → error.
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PRISM_CONFIG_RELATIVE_PATH,
  PrismErrorCode,
  err,
  ok,
  parsePrismConfig,
  prismError,
  type PrismConfig,
  type PrismError,
  type Result,
} from "@repo-prism/shared";

function parseConfigText(raw: string): Result<PrismConfig, PrismError> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `${PRISM_CONFIG_RELATIVE_PATH} is not valid JSON`,
      ),
    );
  }
  return parsePrismConfig(json);
}

export async function loadPrismConfig(
  rootPath: string,
): Promise<Result<PrismConfig, PrismError>> {
  const path = join(rootPath, PRISM_CONFIG_RELATIVE_PATH);
  try {
    return parseConfigText(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return ok({});
    }
    return err(
      prismError(
        PrismErrorCode.IO_ERROR,
        `Could not read ${PRISM_CONFIG_RELATIVE_PATH}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ),
    );
  }
}

/** Sync load used at workspace open (`createWorkspace` is sync). */
export function loadPrismConfigSync(
  rootPath: string,
): Result<PrismConfig, PrismError> {
  const path = join(rootPath, PRISM_CONFIG_RELATIVE_PATH);
  try {
    return parseConfigText(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return ok({});
    }
    return err(
      prismError(
        PrismErrorCode.IO_ERROR,
        `Could not read ${PRISM_CONFIG_RELATIVE_PATH}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ),
    );
  }
}
