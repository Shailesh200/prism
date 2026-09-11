import type { AppView } from "@repo-prism/app-shell";

const HASH_VIEWS = new Set<string>([
  "overview",
  "map",
  "dna",
  "domains",
  "domain",
  "testing",
  "blast",
  "trends",
  "integrations",
  "jobs",
  "settings",
  "review",
  "explain",
]);

const ALIAS: Record<string, AppView> = {
  health: "overview",
  impact: "blast",
};

export function parsePlaygroundView(hash: string): AppView | undefined {
  const raw = hash.replace(/^#\/?/, "").split("?")[0]?.trim() ?? "";
  if (!raw) return undefined;
  if (raw in ALIAS) return ALIAS[raw];
  return HASH_VIEWS.has(raw) ? (raw as AppView) : undefined;
}

export function playgroundHash(view: AppView): string {
  return `#/${view}`;
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
