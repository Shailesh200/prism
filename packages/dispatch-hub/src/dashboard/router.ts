import { useEffect, useState } from "react";

/**
 * Console routes (M-068).
 *
 * Legacy hashes keep working: `#/jobs` → dashboard, `#/intelligence` → iris,
 * `#/workflows` and `#/attention` → dashboard (Needs you lives on Pulse).
 */
export const CONSOLE_VIEWS = [
  "dashboard",
  "findings",
  "iris",
  "trees",
  "skills",
  "settings",
] as const;

export type RailView = (typeof CONSOLE_VIEWS)[number];
export type ConsoleView = RailView | "whats-new" | "wake";

export const VIEW_LABELS: Record<ConsoleView, string> = {
  dashboard: "Dashboard",
  findings: "Findings",
  iris: "Iris",
  trees: "Trees",
  skills: "Skills",
  settings: "Settings",
  "whats-new": "What's new",
  wake: "Wake",
};

export type RouteQuery = {
  readonly repo?: string;
  readonly job?: string;
  readonly note?: string;
  readonly type?: string;
};

export function parseView(hash: string): ConsoleView {
  const raw = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  if (raw === "jobs" || raw === "repos") return "dashboard";
  if (raw === "workflows" || raw === "attention") return "dashboard";
  if (raw === "intelligence") return "iris";
  if (raw === "whats-new") return "whats-new";
  if (raw === "wake") return "wake";
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
  const params = new URLSearchParams();
  if (repo && repo !== "all") params.set("repo", repo);
  if (type && type !== "all") params.set("type", type);
  const q = params.toString();
  return q ? `#/dashboard?${q}` : "#/dashboard";
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
  return q ? `#/findings?${q}` : `#/findings`;
}

export function viewHash(view: ConsoleView, query?: RouteQuery): string {
  if (view === "dashboard") return dashboardHash(query?.repo, query?.type);
  if (view === "findings") return findingsHash(query);
  if (view === "whats-new") return "#/whats-new";
  if (view === "wake") return "#/wake";
  return `#/${view}`;
}

export function useHashRoute(): {
  readonly view: ConsoleView;
  readonly go: (next: ConsoleView, query?: RouteQuery) => void;
  readonly repo: string | undefined;
  readonly type: string | undefined;
  readonly job: string | undefined;
  readonly note: string | undefined;
} {
  const read = () => ({
    view: parseView(window.location.hash),
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
        repo: query?.repo,
        type: query?.type,
        job: query?.job,
        note: query?.note,
      });
    },
  };
}
