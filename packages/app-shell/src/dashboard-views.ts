/**
 * One Dashboard rail (M-078). Nav shows these nine. Everything else is an
 * alias that resolves here so old hashes and host messages keep working.
 */
export const DASHBOARD_VIEWS = [
  "overview",
  "iris",
  "jobs",
  "skills",
  "dna",
  "trends",
  "impact",
  "integrations",
  "settings",
] as const;

export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

/** Legacy hashes / host `ready.view` values. Not shown as their own tabs. */
export type AppViewAlias =
  | "map"
  | "domains"
  | "domain"
  | "testing"
  | "blast"
  | "review"
  | "explain"
  | "guard"
  | "health"
  | "profile"
  | "dashboard"
  | "findings"
  | "trees"
  | "intelligence"
  | "pulse"
  | "board"
  | "list"
  | "repos"
  | "workflows"
  | "attention";

export type AppView = DashboardView | AppViewAlias;

export const DASHBOARD_VIEW_LABELS: Record<DashboardView, string> = {
  overview: "Overview",
  iris: "Iris",
  jobs: "Jobs",
  skills: "Skills",
  dna: "DNA Analysis",
  trends: "Trends",
  impact: "Impact & Guard",
  integrations: "Integrations",
  settings: "Settings",
};

const ALIAS_TO_VIEW: Record<AppViewAlias, DashboardView> = {
  map: "impact",
  domains: "overview",
  domain: "overview",
  testing: "overview",
  blast: "impact",
  review: "impact",
  explain: "impact",
  guard: "impact",
  health: "overview",
  profile: "dna",
  dashboard: "jobs",
  findings: "jobs",
  trees: "dna",
  intelligence: "iris",
  pulse: "jobs",
  board: "jobs",
  list: "jobs",
  repos: "jobs",
  workflows: "jobs",
  attention: "jobs",
};

export function isDashboardView(value: string): value is DashboardView {
  return (DASHBOARD_VIEWS as readonly string[]).includes(value);
}

export function resolveAppView(view: string): DashboardView {
  if (isDashboardView(view)) return view;
  if (view in ALIAS_TO_VIEW) return ALIAS_TO_VIEW[view as AppViewAlias];
  return "overview";
}

export function isImpactView(view: AppView): boolean {
  return (
    view === "impact" ||
    view === "blast" ||
    view === "review" ||
    view === "explain" ||
    view === "guard"
  );
}

/** Parse `#/…` into a nav view. Empty / unknown → overview. */
export function parseDashboardHash(hash: string): DashboardView {
  const raw = hash.replace(/^#\/?/, "").split("?")[0]?.trim() ?? "";
  if (!raw) return "overview";
  if (
    raw === "iris/envelope" ||
    raw === "envelope" ||
    raw.startsWith("iris/")
  ) {
    return "iris";
  }
  return resolveAppView(raw);
}
