/**
 * A capped index (`prism start`'s first answer) analyses the top packages
 * first and says so in one snapshot warning. Everything that answers from a
 * snapshot reads that warning through here, so a partial index is never taken
 * for the whole repository (round 4: CardWise).
 */

export const PARTIAL_INDEX_PREFIX = "partial index:";

export type PartialIndex = {
  readonly analyzed: number;
  readonly total: number;
};

/** The warning the indexer writes when it stops at `analyzed` of `total`. */
export function partialIndexWarning(analyzed: number, total: number): string {
  return `${PARTIAL_INDEX_PREFIX} analyzed ${analyzed} of ${total} code files (top packages first)`;
}

/** The cap a snapshot was built under, or null when it is complete. */
export function partialIndexOf(
  warnings: readonly string[] | undefined,
): PartialIndex | null {
  for (const warning of warnings ?? []) {
    if (!warning.startsWith(PARTIAL_INDEX_PREFIX)) continue;
    const m = /analyzed (\d+) of (\d+)/.exec(warning);
    if (!m) return { analyzed: 0, total: 0 };
    return { analyzed: Number(m[1]), total: Number(m[2]) };
  }
  return null;
}

/** One line for an agent or a user: what is missing and how to finish. */
export function partialIndexLine(partial: PartialIndex): string {
  const counts =
    partial.total > 0
      ? ` (${partial.analyzed} of ${partial.total} code files)`
      : "";
  return `Prism · the index is partial${counts}, so files outside it are missing. Run \`prism index\` to finish it.`;
}
