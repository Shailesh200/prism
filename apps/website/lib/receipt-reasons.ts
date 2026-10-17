/**
 * The worded NOT PROVEN reasons shown on the receipts page (Muse and Arc,
 * 2.0.0). Arc: once #14 sits on top of #13 (pr/4-verdict), take the labels
 * from `REASON_LABEL` in @repo-prism/shared instead of repeating them here.
 */
export type ReceiptReason = {
  readonly code: string;
  readonly label: string;
  readonly means: string;
};

export const RECEIPT_REASONS: readonly ReceiptReason[] = [
  {
    code: "untested",
    label: "no tests reach this change",
    means: "No test covers the changed code.",
  },
  {
    code: "no_node_modules",
    label: "dependencies not installed",
    means: "Install dependencies so the tests can run.",
  },
  {
    code: "unknown_runner",
    label: "no known test runner",
    means: "Prism couldn't find how this repo runs tests.",
  },
  {
    code: "skipped_offline",
    label: "checks skipped",
    means:
      "Checks didn't run, either because you're offline or because they're turned off.",
  },
  {
    code: "still_running",
    label: "checks still running",
    means: "The verdict comes with your next receipt.",
  },
  {
    code: "timeout",
    label: "checks timed out",
    means: "A check ran past its time limit.",
  },
  {
    code: "already_failing",
    label: "tests already failing",
    means: "They failed before this change too.",
  },
  {
    code: "baseline_unknown",
    label: "can't tell if this failure is new",
    means: 'Prism couldn\'t compare with a clean "before" run.',
  },
  {
    code: "outside_change",
    label: "failure is in files outside this change",
    means: "The failing files aren't part of this change.",
  },
  {
    code: "unsupported_language",
    label: "unsupported language",
    means: "Prism can't check this language yet.",
  },
  {
    code: "superseded",
    label: "replaced by a newer change",
    means: "A later receipt replaced this one.",
  },
];
