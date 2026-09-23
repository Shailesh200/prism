import type { AppView, DashboardView } from "@repo-prism/app-shell";

const CANONICAL = new Set<string>([
  "overview",
  "iris",
  "jobs",
  "skills",
  "dna",
  "trends",
  "impact",
  "integrations",
  "settings",
]);

const ALIAS: Record<string, DashboardView> = {
  health: "overview",
  map: "impact",
  domains: "overview",
  domain: "overview",
  testing: "overview",
  findings: "jobs",
  trees: "dna",
  intelligence: "iris",
  dashboard: "jobs",
  profile: "dna",
};

const TAB_HASHES = new Set(["review", "explain", "blast", "guard"]);

/**
 * Playground hashes. Known aliases resolve to the nine-tab rail. Empty /
 * unknown stay undefined so the host can pick the default (Overview).
 */
export function parsePlaygroundView(hash: string): AppView | undefined {
  const raw = hash.replace(/^#\/?/, "").split("?")[0]?.trim() ?? "";
  if (!raw) return undefined;
  if (raw === "iris/envelope" || raw.startsWith("iris/")) return "iris";
  if (TAB_HASHES.has(raw)) return raw as AppView;
  if (CANONICAL.has(raw)) return raw as DashboardView;
  if (raw in ALIAS) return ALIAS[raw];
  return undefined;
}

export type IrisPane = "envelope" | "prepare";

/** Envelope / Prepare pages live under Iris (`#/iris/envelope`, `#/iris/prepare`). */
export function parseIrisPane(hash: string): IrisPane | undefined {
  const raw = hash.replace(/^#\/?/, "").split("?")[0]?.trim() ?? "";
  if (raw === "iris/envelope" || raw === "envelope") return "envelope";
  if (raw === "iris/prepare" || raw === "prepare") return "prepare";
  return undefined;
}

export function irisPaneHash(pane: IrisPane | undefined): string {
  return pane ? `#/iris/${pane}` : "#/iris";
}

export function playgroundHash(view: AppView): string {
  if (CANONICAL.has(view)) return `#/${view}`;
  if (TAB_HASHES.has(view)) {
    return view === "blast" || view === "review" || view === "explain"
      ? "#/impact"
      : "#/impact";
  }
  return `#/${ALIAS[view] ?? "overview"}`;
}

export function isWakeHash(hash: string): boolean {
  const raw = hash.replace(/^#\/?/, "").split("?")[0]?.trim() ?? "";
  return raw === "wake";
}

/**
 * Spectrum may poll Dispatch's selected checkout, but a `?root=` deep link
 * or a repo the user already picked must not snap back to that default.
 */
export function pickPlaygroundRoot(input: {
  readonly prev: string | null;
  readonly fromQuery: string | null;
  readonly defaultRoot: string | null;
}): string | null {
  if (input.fromQuery) return input.fromQuery;
  if (input.prev) return input.prev;
  return input.defaultRoot;
}

export function rootFromSearch(search: string): string | null {
  const value = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  )
    .get("root")
    ?.trim();
  return value || null;
}

export function withRootSearch(
  pathname: string,
  search: string,
  hash: string,
  root: string,
): string {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  params.set("root", root);
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
}
