/**
 * Whether a repository path is test code.
 *
 * Five diverging implementations existed across `impact`, `repository-map`,
 * `intelligence/health`, `intelligence/explorer` and `intelligence/semantic`.
 * They disagreed on directory conventions and file extensions, so the same file
 * counted as a test on one screen and as production code on another
 * (M-051 Phase 3, task 3.7).
 *
 * This is the union of what those implementations recognised.
 */

/** Directory segments that mark everything beneath them as test code. */
const TEST_DIRECTORY = /(^|\/)(__tests__|__mocks__|tests?|e2e|spec|specs)\//i;

/** `foo.test.ts`, `foo.spec.tsx`, `foo.test.mts` and friends. */
const TEST_FILENAME = /\.(test|spec)\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;

/** Test files in languages Prism can detect but does not yet parse. */
const TEST_FILENAME_OTHER_LANGUAGES =
  /(^|\/)(test_[^/]+\.py|[^/]+_test\.(py|go|rb)|[^/]+Test\.(java|kt|cs))$/i;

export function isTestPath(path: string): boolean {
  if (!path) return false;
  const normalized = path.replace(/\\/g, "/");
  return (
    TEST_DIRECTORY.test(normalized) ||
    TEST_FILENAME.test(normalized) ||
    TEST_FILENAME_OTHER_LANGUAGES.test(normalized)
  );
}

/** A TypeScript declaration file — contributes types, not runtime behaviour. */
export function isTypeDeclarationPath(path: string): boolean {
  return /\.d\.[cm]?ts$/i.test(path);
}
