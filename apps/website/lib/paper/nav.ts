export const GITHUB_HREF = "https://github.com/Shailesh200/prism";

export const PRODUCT_LINKS = [
  {
    href: "/product/prepare",
    label: "Prepare",
    text: "The files, tests and code to reuse, before the first edit.",
  },
  {
    href: "/product/blast-radius",
    label: "Blast radius",
    text: "Who calls a symbol, and what a change reaches.",
  },
  {
    href: "/product/guardrails",
    label: "Guardrails",
    text: "Renames, deletes, and the files that need a closer look.",
  },
  {
    href: "/product/receipts",
    label: "Receipts",
    text: "A local record of each Intelligence call. Counts and bytes, never source.",
  },
  {
    href: "/product/review",
    label: "Review",
    text: "Rank the change by risk before you push.",
  },
  {
    href: "/product/lenses",
    label: "Lenses",
    text: "Risk bands for a change. Named review modes are not in this release.",
  },
  {
    href: "/product/habits",
    label: "Habits",
    text: "Start my day, and skills your agent can load.",
  },
  {
    href: "/product/cli",
    label: "CLI",
    text: "The same answers, in your terminal.",
  },
] as const;

export const FOOTER = [
  {
    title: "Product",
    links: PRODUCT_LINKS.map((item) => ({
      href: item.href,
      label: item.label,
    })),
  },
  {
    title: "Get started",
    links: [
      { href: "/install", label: "Install" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/benchmarks", label: "Benchmarks" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/mcp-tools", label: "MCP tools" },
      { href: "/docs/cli", label: "CLI reference" },
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: "/changelog", label: "Changelog" },
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
      { href: "/open-source", label: "Open source" },
    ],
  },
] as const;
