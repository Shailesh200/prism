import { useEffect, useState } from "react";

/**
 * Console routes (M-068).
 *
 * Legacy hashes keep working: `#/jobs` → dashboard, `#/intelligence` → iris,
 * `#/workflows` → attention.
 */
export const CONSOLE_VIEWS = [
  "dashboard",
  "attention",
  "findings",
  "iris",
  "settings",
] as const;

export type ConsoleView = (typeof CONSOLE_VIEWS)[number];

export const VIEW_LABELS: Record<ConsoleView, string> = {
  dashboard: "Dashboard",
  attention: "Attention",
  findings: "Findings",
  iris: "Iris",
  settings: "Settings",
};

export type RouteQuery = {
  readonly repo?: string;
  readonly job?: string;
  readonly note?: string;
};

export function parseView(hash: string): ConsoleView {
  const raw = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  if (raw === "jobs" || raw === "repos") return "dashboard";
  if (raw === "workflows") return "attention";
  if (raw === "intelligence") return "iris";
  return (CONSOLE_VIEWS as readonly string[]).includes(raw)
    ? (raw as ConsoleView)
    : "dashboard";
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

export function parseJobId(hash: string): string | undefined {
  return queryParam(hash, "job");
}

export function parseNotePath(hash: string): string | undefined {
  return queryParam(hash, "note");
}

export function dashboardHash(repo?: string): string {
  if (!repo || repo === "all") return "#/dashboard";
  return `#/dashboard?repo=${encodeURIComponent(repo)}`;
}

export function jobsHash(repo?: string): string {
  return dashboardHash(repo);
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
  if (view === "dashboard") return dashboardHash(query?.repo);
  if (view === "findings") return findingsHash(query);
  if (view === "attention" && query?.job) {
    return `#/attention?job=${encodeURIComponent(query.job)}`;
  }
  return `#/${view}`;
}

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
