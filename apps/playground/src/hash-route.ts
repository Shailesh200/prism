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
