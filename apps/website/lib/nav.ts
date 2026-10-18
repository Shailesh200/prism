/** Site chrome links, shared by the nav, the mobile sheet and the footer. */

export type NavLink = { href: string; label: string };

export const PRODUCTS: Array<NavLink & { blurb: string }> = [
  {
    href: "/product/prepare",
    label: "Prepare",
    blurb: "The files to edit, before the change",
  },
  {
    href: "/product/review",
    label: "Review",
    blurb: "Findings, then a Receipt",
  },
  {
    href: "/product/lenses",
    label: "Lenses",
    blurb: "Dev, QA, and Architect",
  },
  {
    href: "/product/blast-radius",
    label: "Blast radius",
    blurb: "Every caller, before the change",
  },
  {
    href: "/product/guardrails",
    label: "Guardrails",
    blurb: "Safe renames and deletes",
  },
  {
    href: "/product/receipts",
    label: "Receipts",
    blurb: "Your checks when the agent stops",
  },
  {
    href: "/product/habits",
    label: "Habits",
    blurb: "Routines your agent runs",
  },
  {
    href: "/product/cli",
    label: "CLI",
    blurb: "The same answers in a terminal",
  },
];

export const HOW_IT_WORKS: NavLink = {
  href: "/how-it-works",
  label: "How it works",
};

/** Links after the Product menu in the top nav. */
export const NAV_LINKS: NavLink[] = [
  HOW_IT_WORKS,
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

const INSTALL: NavLink = { href: "/install", label: "Install" };

export const PROJECT_LINKS: NavLink[] = [
  { href: "/open-source", label: "Open source" },
  { href: "/privacy", label: "Privacy" },
  { href: "/security", label: "Security" },
];

/** Mobile sheet groups after Product. */
export const SHEET_GROUPS: Array<{ title: string; links: NavLink[] }> = [
  {
    title: "Get started",
    links: [
      HOW_IT_WORKS,
      { href: "/benchmarks", label: "Benchmarks" },
      INSTALL,
      { href: "/docs", label: "Docs" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  { title: "Project", links: PROJECT_LINKS },
];

export const FOOTER_COLUMNS: Array<{ title: string; links: NavLink[] }> = [
  { title: "Product", links: PRODUCTS },
  {
    title: "Get started",
    links: [
      INSTALL,
      HOW_IT_WORKS,
      { href: "/docs/start/quickstart", label: "Quickstart" },
      { href: "/benchmarks", label: "Benchmarks" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/reference/mcp-tools", label: "MCP tools" },
      { href: "/docs/reference/cli-commands", label: "CLI reference" },
      { href: "/docs/help/troubleshooting", label: "Troubleshooting" },
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
];
