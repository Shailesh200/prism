/**
 * Persist `.prism/config.json` (M-057 P-B6 write-through from IDE settings).
 */

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

export async function writePrismConfig(
  rootPath: string,
  config: PrismConfig,
): Promise<Result<PrismConfig, PrismError>> {
  const validated = parsePrismConfig(config);
  if (!validated.ok) return validated;

  const dir = join(rootPath, ".prism");
  const path = join(rootPath, PRISM_CONFIG_RELATIVE_PATH);
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
