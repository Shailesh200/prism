import { useEffect, useState } from "react";

/**
 * Console routes (M-078). Same nine tabs as `dashboard-views.ts` /
 * AppSidebar. Kept local so hub tests do not need an app-shell rebuild.
 */
export const CONSOLE_VIEWS = [
  "overview",
  "iris",
  "lenses",
  "skills",
  "dna",
  "trends",
  "impact",
  "integrations",
  "settings",
] as const;

export type RailView = (typeof CONSOLE_VIEWS)[number];
export type ConsoleView = RailView | "whats-new" | "wake";

export const VIEW_LABELS: Record<ConsoleView, string> = {
  overview: "Overview",
  iris: "Iris",
  lenses: "Lenses",
  skills: "Skills",
  dna: "DNA Analysis",
  trends: "Trends",
  impact: "Impact & Guard",
  integrations: "Integrations",
  settings: "Settings",
  "whats-new": "What's new",
  wake: "Wake",
};

const ALIAS: Record<string, RailView> = {
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
  dashboard: "impact",
  findings: "impact",
  jobs: "impact",
  trees: "dna",
  intelligence: "iris",
  pulse: "impact",
  board: "impact",
  list: "impact",
  repos: "impact",
  workflows: "impact",
  attention: "impact",
};

function resolveRail(raw: string): RailView {
  if ((CONSOLE_VIEWS as readonly string[]).includes(raw)) {
    return raw as RailView;
  }
  return ALIAS[raw] ?? "overview";
}

export type RouteQuery = {
  readonly repo?: string;
  readonly job?: string;
  readonly note?: string;
  readonly type?: string;
  readonly mode?: string;
};

export function isEmbedSearch(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("embed") === "1";
}

export function parseView(hash: string): ConsoleView {
  const raw = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  if (raw === "whats-new") return "whats-new";
  if (raw === "wake") return "wake";
  if (
    raw === "iris/envelope" ||
    raw === "envelope" ||
    raw.startsWith("iris/")
  ) {
    return "iris";
  }
  return resolveRail(raw || "overview");
}

export function parseJobsMode(hash: string): "findings" | undefined {
  const raw = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  if (raw === "findings") return "findings";
  return queryParam(hash, "mode") === "findings" ? "findings" : undefined;
}

/** Envelope details live under Iris (`#/iris/envelope`). */
export function parseIrisPane(hash: string): "envelope" | undefined {
  const raw = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  if (raw === "iris/envelope" || raw === "envelope") return "envelope";
  return undefined;
}

export function irisHash(repo?: string): string {
  const params = new URLSearchParams();
  if (repo && repo !== "all") params.set("repo", repo);
  const q = params.toString();
  return q ? `#/iris?${q}` : "#/iris";
}

export function envelopeHash(repo?: string): string {
  const params = new URLSearchParams();
  if (repo && repo !== "all") params.set("repo", repo);
  const q = params.toString();
  return q ? `#/iris/envelope?${q}` : "#/iris/envelope";
}

function queryParam(hash: string, key: string): string | undefined {
  const query = hash.replace(/^#\/?/, "").split("?")[1];
  if (!query) return undefined;
  const value = new URLSearchParams(query).get(key)?.trim();
  return value ? value : undefined;
}

export function parseRepoFilter(hash: string): string | undefined {
  return queryParam(hash, "repo");
}

export function parseTypeQuery(hash: string): string | undefined {
  return queryParam(hash, "type");
}

export function parseJobId(hash: string): string | undefined {
  return queryParam(hash, "job");
}

export function parseNotePath(hash: string): string | undefined {
  return queryParam(hash, "note");
}

export function dashboardHash(repo?: string, type?: string): string {
  return jobsHash(repo, type);
}

export function jobsHash(repo?: string, type?: string): string {
  const params = new URLSearchParams();
  if (repo && repo !== "all") params.set("repo", repo);
  if (type && type !== "all") params.set("type", type);
  const q = params.toString();
  return q ? `#/jobs?${q}` : "#/jobs";
}

export function findingsHash(query?: RouteQuery): string {
  const params = new URLSearchParams();
  if (query?.job) params.set("job", query.job);
  if (query?.note) params.set("note", query.note);
  if (query?.repo && query.repo !== "all") params.set("repo", query.repo);
  const q = params.toString();
  return q ? `#/findings?${q}` : `#/findings`;
}

export function viewHash(view: ConsoleView, query?: RouteQuery): string {
  if (view === "impact" && query?.mode === "findings")
    return findingsHash(query);
  if (view === "whats-new") return "#/whats-new";
  if (view === "wake") return "#/wake";
  if (view === "iris") return irisHash(query?.repo);
  return `#/${view}`;
}

export function useHashRoute(): {
  readonly view: ConsoleView;
  readonly pane: "envelope" | undefined;
  readonly jobsMode: "findings" | undefined;
  readonly go: (next: ConsoleView, query?: RouteQuery) => void;
  readonly repo: string | undefined;
  readonly type: string | undefined;
  readonly job: string | undefined;
  readonly note: string | undefined;
} {
  const read = () => ({
    view: parseView(window.location.hash),
    pane: parseIrisPane(window.location.hash),
    jobsMode: parseJobsMode(window.location.hash),
    repo: parseRepoFilter(window.location.hash),
    type: parseTypeQuery(window.location.hash),
    job: parseJobId(window.location.hash),
    note: parseNotePath(window.location.hash),
  });
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = (): void => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return {
    ...route,
    go: (next, query) => {
      window.location.hash = viewHash(next, query);
      setRoute({
        view: next,
        pane: undefined,
        jobsMode: query?.mode === "findings" ? "findings" : undefined,
        repo: query?.repo,
        type: query?.type,
        job: query?.job,
        note: query?.note,
      });
    },
  };
}
