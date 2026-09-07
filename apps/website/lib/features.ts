/** Task-led feature index — lives on /benchmarks after Features merged. */

export const FEATURES = [
  {
    href: "/docs/guides/understand-a-repo",
    title: "Orient in a new repo",
    body: "DNA, map, landmarks, and stack profile.",
  },
  {
    href: "/docs/guides/before-you-edit",
    title: "Blast before you edit",
    body: "See dependents, tests, and features in the blast radius.",
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
    href: "/docs/guides/track-health",
    title: "Track health",
    body: "Engineering health scores and history.",
  },
  {
    href: "/docs/guides/investigate-domain",
    title: "Domain deep dives",
    body: "Frontend, backend, testing, and security reports.",
  },
  {
    href: "/docs/guides/wire-into-ci",
    title: "CI gates",
    body: "Run Prism in pipelines with fail-on thresholds.",
  },
  {
    href: "/docs/guides/dispatch#local-workers",
    title: "Dispatch a teammate",
    body: "Hand a change to a background teammate in your editor; Prism runs the checks when it stops.",
  },
  {
    href: "/docs/guides/dispatch#talk-in-chat",
    title: "Start my day",
    body: "A standup briefing: yesterday's jobs, what's waiting, suggested focus.",
  },
  {
    href: "/docs/reference/capabilities",
    title: "Full capability table",
    body: "Every command and MCP tool in one lookup.",
  },
] as const;
