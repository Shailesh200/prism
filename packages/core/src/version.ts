/** Core package version + API level for surfaces (ADR-0019 / M-025). */
export const PRISM_CORE_VERSION = "1.0.1" as const;

/**
 * Bump when a **stable** public method signature or return DTO changes
 * incompatibly. From 1.0.0 that also means a major version bump — the two move
 * together, and `api-surface.test.ts` fails the build if a method is removed
 * or renamed without one.
 */
export const PRISM_API_LEVEL = 1 as const;
