/**
 * Persist `.prism/config.json` (M-057 P-B6 write-through from IDE settings).
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
import { loadPrismConfig } from "./prism-config-load.js";

export type WritePrismConfigOptions = {
  /**
   * Migration mode (M-057 P-B6): write only when `.prism/config.json` does
   * not exist yet. A hand-edited or CLI-written file is never clobbered by
   * the IDE settings store's startup migration. When skipped, the existing
   * file's config is returned.
   */
  readonly ifAbsent?: boolean;
};

export async function writePrismConfig(
  rootPath: string,
  config: PrismConfig,
  options?: WritePrismConfigOptions,
): Promise<Result<PrismConfig, PrismError>> {
  const validated = parsePrismConfig(config);
  if (!validated.ok) return validated;

  const path = join(rootPath, PRISM_CONFIG_RELATIVE_PATH);
  if (options?.ifAbsent && existsSync(path)) {
    return loadPrismConfig(rootPath);
  }

  const dir = join(rootPath, ".prism");
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify(validated.value, null, 2)}\n`,
      "utf8",
    );
    return ok(validated.value);
  } catch (error) {
    return err(
      prismError(
        PrismErrorCode.IO_ERROR,
        `Could not write ${PRISM_CONFIG_RELATIVE_PATH}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ),
    );
  }
}
