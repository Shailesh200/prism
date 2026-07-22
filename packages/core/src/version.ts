/** Core package version + API level for surfaces (ADR-0019 / M-025). */
export const PRISM_CORE_VERSION = "0.1.0" as const;

/**
 * Bump when a **stable** public method signature or return DTO changes
 * incompatibly (pre-1.0). Additive / experimental-only changes do not bump.
 */
export const PRISM_API_LEVEL = 1 as const;
