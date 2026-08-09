/**
 * Pure GitHub Actions helpers — repo ref parsing, workflow id match, DTO maps.
 * Network I/O lives in `@repo-prism/core` behind the consent gate (M-053 / ADR-0033).
 */

export type GithubCiConfig = {
  readonly owner: string;
  readonly repo: string;
  readonly token?: string;
};

export type GithubWorkflowSummary = {
  readonly id: number;
  readonly name: string;
  readonly path: string;
  readonly state: string;
  readonly htmlUrl: string;
};

export type GithubWorkflowRun = {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly event: string;
  readonly headBranch: string;
  readonly actorLogin: string | null;
  /** GitHub avatar URL when present on the run actor. */
  readonly actorAvatarUrl: string | null;
  readonly displayTitle: string;
};

export type GithubRepoInfo = {
  readonly owner: string;
  readonly repo: string;
  readonly private: boolean;
  readonly defaultBranch: string;
  readonly htmlUrl: string;
};

export type DispatchWorkflowKind = "workflow_dispatch" | "repository_dispatch";

export type DispatchWorkflowInput = {
  readonly owner: string;
  readonly repo: string;
  readonly token?: string;
  readonly kind: DispatchWorkflowKind;
  /** Prefer numeric workflow id; basename / path used as fallback. */
  readonly workflowId?: number | string;
  readonly workflowPath?: string;
  /** Preferred git ref (UI branch). Falls back to repo default branch. */
  readonly ref?: string;
  readonly inputs?: Record<string, string>;
  readonly eventType?: string;
};

/**
 * Parse `owner/repo` or a github.com URL into `{ owner, repo }`.
 * Returns null when the input cannot be resolved.
 */
export function parseGithubRepoRef(
  input: string,
): { owner: string; repo: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  const slug = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(raw);
  if (slug) {
    return { owner: slug[1]!, repo: slug[2]! };
  }
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!/github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0]!;
    const repo = parts[1]!.replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

/**
 * Match a local workflow path to a remote workflow summary (path or basename).
 */
export function matchRemoteWorkflowId(
  workflowPath: string,
  remotes: readonly GithubWorkflowSummary[],
): number | undefined {
  const path = workflowPath.replace(/^\/+/, "");
  const base = path.split("/").pop() ?? path;
  const byPath = remotes.find(
    (w) => w.path === path || w.path.endsWith(`/${base}`),
  );
  if (byPath) return byPath.id;
  const byBase = remotes.find((w) => {
    const remoteBase = w.path.split("/").pop() ?? w.path;
    return remoteBase === base;
  });
  return byBase?.id;
}

/** Prefer numeric id, then non-empty string id, then workflow path basename. */
export function workflowDispatchKey(
  workflowId: number | string | undefined,
  workflowPath: string | undefined,
): string | null {
  if (typeof workflowId === "number" && Number.isFinite(workflowId)) {
    return String(workflowId);
  }
  if (typeof workflowId === "string" && workflowId.trim() !== "") {
    return workflowId.trim();
  }
  if (workflowPath && workflowPath.trim() !== "") {
    const path = workflowPath.trim().replace(/^\/+/, "");
    return path.split("/").pop() ?? path;
  }
  return null;
}

/**
 * Build ordered workflow dispatch keys from local input (no network).
 * Numeric id → full path → basename. Remote id resolution happens in Core.
 */
export function collectWorkflowDispatchKeys(input: {
  readonly workflowId?: number | string;
  readonly workflowPath?: string;
}): string[] {
  const keys: string[] = [];
  const push = (k: string | null | undefined): void => {
    if (!k) return;
    const t = k.trim();
    if (!t || keys.includes(t)) return;
    keys.push(t);
  };

  push(workflowDispatchKey(input.workflowId, undefined));
  const path = (input.workflowPath ?? "").trim().replace(/^\/+/, "");
  if (path) {
    push(path);
    push(path.split("/").pop());
  }
  return keys;
}

/** Map GET /actions/workflows JSON → summaries (skips deleted). */
export function mapGithubWorkflowSummaries(
  json: unknown,
): GithubWorkflowSummary[] {
  const list = Array.isArray((json as { workflows?: unknown }).workflows)
    ? ((json as { workflows: unknown[] }).workflows ?? [])
    : [];
  const workflows: GithubWorkflowSummary[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const w = row as Record<string, unknown>;
    if (typeof w.id !== "number" || typeof w.name !== "string") continue;
    if (w.state === "deleted") continue;
    workflows.push({
      id: w.id,
      name: w.name,
      path: typeof w.path === "string" ? w.path : "",
      state: typeof w.state === "string" ? w.state : "active",
      htmlUrl: typeof w.html_url === "string" ? w.html_url : "",
    });
  }
  return workflows;
}

/** Map GET /actions/runs JSON → run DTOs. */
export function mapGithubWorkflowRuns(json: unknown): GithubWorkflowRun[] {
  const list = Array.isArray(
    (json as { workflow_runs?: unknown }).workflow_runs,
  )
    ? ((json as { workflow_runs: unknown[] }).workflow_runs ?? [])
    : [];
  const runs: GithubWorkflowRun[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "number") continue;
    const actorObj =
      r.actor && typeof r.actor === "object"
        ? (r.actor as { login?: unknown; avatar_url?: unknown })
        : null;
    const triggeringObj =
      r.triggering_actor && typeof r.triggering_actor === "object"
        ? (r.triggering_actor as { login?: unknown; avatar_url?: unknown })
        : null;
    const login =
      typeof actorObj?.login === "string"
        ? actorObj.login
        : typeof triggeringObj?.login === "string"
          ? triggeringObj.login
          : null;
    const avatarUrl =
      typeof actorObj?.avatar_url === "string"
        ? actorObj.avatar_url
        : typeof triggeringObj?.avatar_url === "string"
          ? triggeringObj.avatar_url
          : null;
    runs.push({
      id: r.id,
      name: typeof r.name === "string" ? r.name : "workflow",
      status: typeof r.status === "string" ? r.status : "unknown",
      conclusion: typeof r.conclusion === "string" ? r.conclusion : null,
      htmlUrl: typeof r.html_url === "string" ? r.html_url : "",
      createdAt:
        typeof r.created_at === "string"
          ? r.created_at
          : new Date().toISOString(),
      updatedAt:
        typeof r.updated_at === "string"
          ? r.updated_at
          : new Date().toISOString(),
      event: typeof r.event === "string" ? r.event : "",
      headBranch: typeof r.head_branch === "string" ? r.head_branch : "",
      actorLogin: login,
      actorAvatarUrl: avatarUrl,
      displayTitle:
        typeof r.display_title === "string"
          ? r.display_title
          : typeof r.name === "string"
            ? r.name
            : `#${r.id}`,
    });
  }
  return runs;
}

/** Map GET /repos/{owner}/{repo} JSON → repo info. */
export function mapGithubRepoInfo(
  json: unknown,
  owner: string,
  repo: string,
): GithubRepoInfo | null {
  if (!json || typeof json !== "object") return null;
  const row = json as Record<string, unknown>;
  const defaultBranch =
    typeof row.default_branch === "string" && row.default_branch
      ? row.default_branch
      : "main";
  const htmlUrl =
    typeof row.html_url === "string"
      ? row.html_url
      : `https://github.com/${owner}/${repo}`;
  return {
    owner,
    repo,
    private: row.private === true,
    defaultBranch,
    htmlUrl,
  };
}

/** Map GET /user JSON → login, or null. */
export function mapGithubAuthenticatedLogin(json: unknown): string | null {
  if (
    json &&
    typeof json === "object" &&
    typeof (json as { login?: unknown }).login === "string"
  ) {
    return (json as { login: string }).login;
  }
  return null;
}
