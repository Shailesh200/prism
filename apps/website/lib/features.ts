/** Task-led feature index — lives on /benchmarks after Features merged. */

export const FEATURES = [
  {
    href: "/docs/guides/understand-a-repo",
    title: "Orient in a new repo",
    body: "DNA, landmarks, and stack profile in one overview.",
  },
  {
    href: "/docs/guides/prepare-a-change",
    title: "Prepare a change",
    body: "Pack, reuse, House Style, and a work order — never file bodies.",
  },
  {
    href: "/docs/guides/before-you-edit",
    title: "Blast before you edit",
    body: "See dependents and tests in the blast radius.",
  },
  {
    href: "/docs/guides/guard-a-session",
    title: "Guard a session",
    body: "Rank this session’s dirty files. Read the high-blast ones first.",
  },
  {
    href: "/docs/guides/envelope",
    title: "Envelope",
    body: "A receipt for every Prism tool call. Never source.",
  },
  {
    href: "/docs/guides/findings",
    title: "Queue a finding",
    body: "Unused, duplicate, wrapper — resolved only after a re-scan.",
  },
  {
    href: "/docs/guides/review-a-pr",
    title: "Review a change",
    body: "Diff-aware impact for pull requests.",
  },
  {
    href: "/docs/guides/delete-safely",
    title: "Delete safely",
    body: "Check whether a symbol or file still has dependents.",
  },
  {
    href: "/docs/guides/wire-into-ci",
    title: "CI gates",
    body: "Run the change receipt in pipelines.",
  },
  {
    href: "/docs/reference/capabilities",
    title: "Full capability table",
    body: "Every command and MCP tool in one lookup.",
  },
] as const;
