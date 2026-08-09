/**
 * `.prism/config.json` — shared indexing knobs for CLI and IDE (M-057 P-B6).
 *
 * Precedence when indexing: explicit IndexWorkspaceOptions / CLI flags >
 * this file > indexer defaults.
 */

import { z } from "zod";
import { PrismErrorCode, prismError, type PrismError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

export const PrismConfigSchema = z
  .object({
    /** Extra gitignore-style globs on top of builtin / .gitignore / .prismignore. */
    excludeGlobs: z.array(z.string().min(1)).optional(),
    /**
     * Skip hashing files larger than this many bytes.
     * Omit for the indexer default (5 MiB). Use `null` for no limit.
     */
    maxFileBytes: z.number().int().positive().nullable().optional(),
  })
  .strict();

export type PrismConfig = z.infer<typeof PrismConfigSchema>;

export const PRISM_CONFIG_FILENAME = "config.json";
export const PRISM_CONFIG_RELATIVE_PATH = `.prism/${PRISM_CONFIG_FILENAME}`;

/** Parse and validate a config JSON value. */
export function parsePrismConfig(
  raw: unknown,
): Result<PrismConfig, PrismError> {
  const parsed = PrismConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Invalid ${PRISM_CONFIG_RELATIVE_PATH}: ${parsed.error.issues
          .map((i) => i.message)
          .join("; ")}`,
      ),
    );
  }
  return ok(parsed.data);
}

/**
 * Merge index knobs. Later sources win for each field that is set.
 * `maxFileBytes: null` in config means "no limit" (Number.MAX_SAFE_INTEGER).
 */
export function mergeIndexLimits(sources: {
  readonly defaults: {
    readonly maxFileBytes: number;
    readonly extraIgnorePatterns: readonly string[];
  };
  readonly config?: PrismConfig | null;
  readonly flags?: {
    readonly maxFileBytes?: number;
    readonly extraIgnorePatterns?: readonly string[];
  };
}): {
  readonly maxFileBytes: number;
  readonly extraIgnorePatterns: readonly string[];
} {
  let maxFileBytes = sources.defaults.maxFileBytes;
  let extraIgnorePatterns = [...sources.defaults.extraIgnorePatterns];

  if (sources.config) {
    if (sources.config.maxFileBytes === null) {
      maxFileBytes = Number.MAX_SAFE_INTEGER;
    } else if (typeof sources.config.maxFileBytes === "number") {
      maxFileBytes = sources.config.maxFileBytes;
    }
    if (sources.config.excludeGlobs?.length) {
      extraIgnorePatterns = [
        ...extraIgnorePatterns,
        ...sources.config.excludeGlobs,
      ];
    }
  }

  if (sources.flags) {
    if (typeof sources.flags.maxFileBytes === "number") {
      maxFileBytes = sources.flags.maxFileBytes;
    }
    if (sources.flags.extraIgnorePatterns?.length) {
      extraIgnorePatterns = [
        ...extraIgnorePatterns,
        ...sources.flags.extraIgnorePatterns,
      ];
    }
  }

  return { maxFileBytes, extraIgnorePatterns };
}

/** Map IDE max-file-size option ids to bytes (`none` → null = no limit). */
export function maxFileSizeOptionToBytes(
  option: "256kb" | "1mb" | "5mb" | "10mb" | "none",
): number | null {
  switch (option) {
    case "256kb":
      return 256 * 1024;
    case "1mb":
      return 1024 * 1024;
    case "5mb":
      return 5 * 1024 * 1024;
    case "10mb":
      return 10 * 1024 * 1024;
    case "none":
      return null;
  }
}

/**
 * Reverse of {@link maxFileSizeOptionToBytes} for hydrating the IDE settings
 * UI from `.prism/config.json`. Returns undefined for byte values that do not
 * map to an option (custom hand-edited sizes) so callers leave the current
 * selection untouched instead of snapping to a wrong bucket.
 */
export function maxFileSizeOptionFromBytes(
  bytes: number | null | undefined,
): "256kb" | "1mb" | "5mb" | "10mb" | "none" | undefined {
  if (bytes === null) return "none";
  if (bytes === undefined) return undefined;
  switch (bytes) {
    case 256 * 1024:
      return "256kb";
    case 1024 * 1024:
      return "1mb";
    case 5 * 1024 * 1024:
      return "5mb";
    case 10 * 1024 * 1024:
      return "10mb";
    default:
      return undefined;
  }
}
