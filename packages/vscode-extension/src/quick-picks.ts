import { riskBandDescriptor, type BlastRadiusReport } from "@repo-prism/shared";

/**
 * Pure builders behind the extension's Quick Pick commands (M-057 P-B2/P-B3),
 * extracted from `extension.ts` so the happy paths are unit-testable without
 * a VS Code host.
 */

export type BlastQuickPickItem = {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  readonly action?: "open";
};

/** How many affected files the blast Quick Pick lists (M-057 P-B3). */
export const BLAST_QUICK_PICK_TOP = 8;

/**
 * Items for `prism.blastQuickPick`: a risk-band header, the nearest affected
 * files (depth order, capped), and an escape hatch to the full Impact screen.
 */
export function buildBlastQuickPickItems(
  report: Pick<BlastRadiusReport, "risk" | "affectedFiles">,
  targetPath: string,
): BlastQuickPickItem[] {
  const band = riskBandDescriptor(report.risk);
  const top = [...report.affectedFiles]
    .sort((a, b) => a.depth - b.depth)
    .slice(0, BLAST_QUICK_PICK_TOP);
  return [
    {
      label: `$(zap) ${band.short} risk (${Math.round(report.risk)})`,
      description: `${report.affectedFiles.length} affected`,
      detail: targetPath,
    },
    ...top.map((item) => ({
      label: item.path,
      description: `depth ${item.depth}`,
      detail: item.reason,
    })),
    {
      label: "$(link-external) Open full Impact",
      action: "open" as const,
    },
  ];
}

export type ReviewAllOutcome =
  | { readonly kind: "review"; readonly paths: readonly string[] }
  | { readonly kind: "empty"; readonly base: string };

/**
 * Decision behind `prism.reviewAllChanges` (M-057 P-B2): open Change Review
 * with every changed path, or say there is nothing to review.
 */
export function reviewAllOutcome(result: {
  readonly paths: readonly string[];
  readonly base: string;
}): ReviewAllOutcome {
  return result.paths.length === 0
    ? { kind: "empty", base: result.base }
    : { kind: "review", paths: result.paths };
}
