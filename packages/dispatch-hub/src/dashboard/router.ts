import { useEffect, useState } from "react";

/**
 * The Console's views.
 *
 * Repos is a filter on Jobs, not a tab. Workflows was a duplicate of the
 * waiting banner. Dispatch settings used to be chat-only (`configure`); they
 * live here so a preference survives after the agent stops talking. Old
 * `#/workflows` and `#/repos` hashes still land on Jobs.
 *
 * Findings is the full write-up for a job (the markdown under
 * `.prism/dispatch/notes/`), opened from a summary path or this tab.
 */
export const CONSOLE_VIEWS = [
  "jobs",
  "findings",
  "intelligence",
  "settings",
] as const;

export type ConsoleView = (typeof CONSOLE_VIEWS)[number];

export const VIEW_LABELS: Record<ConsoleView, string> = {
  jobs: "Jobs",
  findings: "Findings",
  intelligence: "Intelligence",
  settings: "Dispatch Settings",
};

export type RouteQuery = {
  readonly repo?: string;
  readonly job?: string;
  readonly note?: string;
};

export function parseView(hash: string): ConsoleView {
  const raw = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  if (raw === "workflows" || raw === "repos") return "jobs";
  return (CONSOLE_VIEWS as readonly string[]).includes(raw)
    ? (raw as ConsoleView)
    : "jobs";
}

function queryParam(hash: string, key: string): string | undefined {
  const query = hash.replace(/^#\/?/, "").split("?")[1];
  if (!query) return undefined;
  const value = new URLSearchParams(query).get(key)?.trim();
  return value ? value : undefined;
}

/** Workspace path from `#/jobs?repo=` or `#/findings?repo=`. */
export function parseRepoFilter(hash: string): string | undefined {
  return queryParam(hash, "repo");
}

export function parseJobId(hash: string): string | undefined {
  return queryParam(hash, "job");
}

export function parseNotePath(hash: string): string | undefined {
  return queryParam(hash, "note");
}

export function jobsHash(repo?: string): string {
  if (!repo || repo === "all") return "#/jobs";
  return `#/jobs?repo=${encodeURIComponent(repo)}`;
}

export function findingsHash(query?: RouteQuery): string {
  const params = new URLSearchParams();
  if (query?.job) params.set("job", query.job);
  if (query?.note) params.set("note", query.note);
  if (query?.repo && query.repo !== "all") params.set("repo", query.repo);
  const q = params.toString();
  return q ? `#/findings?${q}` : "#/findings";
}

export function viewHash(view: ConsoleView, query?: RouteQuery): string {
  if (view === "jobs") return jobsHash(query?.repo);
  if (view === "findings") return findingsHash(query);
  return `#/${view}`;
}

/**
 * A hash router, deliberately.
 *
 * The Console is served from a plain Node HTTP server with no rewrite rules,
 * so a path-based route would 404 on reload. A hash also keeps the token in
 * the query string working across navigation.
 */
export function useHashRoute(): {
  readonly view: ConsoleView;
  readonly go: (next: ConsoleView, query?: RouteQuery) => void;
  readonly repo: string | undefined;
  readonly job: string | undefined;
  readonly note: string | undefined;
} {
  const read = () => ({
    view: parseView(window.location.hash),
    repo: parseRepoFilter(window.location.hash),
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
        repo: query?.repo,
        job: query?.job,
        note: query?.note,
      });
    },
  };
}
