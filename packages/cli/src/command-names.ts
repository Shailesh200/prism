/**
 * Command names for `prism completions`. Kept beside COMMANDS so the
 * completions module never imports `commands.ts` (that cycle made the
 * CLI graph report commands.ts ↔ completions.ts).
 *
 * `boundaries.test.ts` asserts this list matches COMMANDS, so a new
 * command that forgets to land here fails the suite.
 */
export const CLI_COMMAND_NAMES = [
  "doctor",
  "index",
  "completions",
  "dna",
  "health",
  "map",
  "explain",
  "explore",
  "stack",
  "features",
  "landmarks",
  "packages",
  "blast",
  "review",
  "safe-delete",
  "rename",
  "test-impact",
  "deps",
  "cycles",
  "symbol",
  "refs",
  "route",
  "engineering",
  "testing",
  "security",
  "backend",
  "bundle",
] as const;
