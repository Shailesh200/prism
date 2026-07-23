/**
 * Opt-in GitHub Actions helpers for Domain · DevOps (webview fetch).
 * Requires Settings → Allow network integrations + Integrations · GitHub.
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

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token && token.trim() !== "") {
    h.Authorization = `Bearer ${token.trim()}`;
  }
  return h;
}

/** Friendly, actionable message for a non-2xx GitHub REST response. */
function describeGithubStatus(status: number, body: string): string {
  const detail = body ? `: ${body.slice(0, 160)}` : "";
  if (status === 401) {
    return "GitHub rejected the token (401). Check that it is valid and not expired.";
  }
  if (status === 403 || status === 429) {
    return `GitHub returned ${status} — likely rate limited or the token lacks access. Adding or refreshing a token usually raises the limit.`;
  }
  if (status === 404) {
    return "Not found (404). Check Integrations owner/repo matches the workflow host, the workflow file exists on that default branch, and private repos have a token with Actions: write.";
  }
  if (status === 422) {
    return `GitHub rejected the request (422)${detail}. The branch may be missing or the workflow may not declare workflow_dispatch.`;
  }
  return `GitHub ${status}${detail}`;
}

/**
 * Turn a thrown fetch error into a clear message. A bare `TypeError`
 * ("Failed to fetch") almost always means the request never left the browser
 * (offline, blocked host, or the network integrations gate being off).
 */
function describeGithubError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Couldn't reach GitHub (network request failed). Check your connection and that Settings → Allow network integrations is on.";
  }
  return err instanceof Error ? err.message : String(err);
}

export async function fetchGithubAuthenticatedLogin(
  token: string,
): Promise<string | null> {
  if (!token.trim()) return null;
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: headers(token),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (
      json &&
      typeof json === "object" &&
      typeof (json as { login?: unknown }).login === "string"
    ) {
      return (json as { login: string }).login;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function fetchGithubWorkflows(
  cfg: GithubCiConfig,
): Promise<
  | { ok: true; workflows: GithubWorkflowSummary[] }
  | { ok: false; error: string }
> {
  const { owner, repo, token } = cfg;
  if (!owner || !repo) {
    return { ok: false, error: "GitHub owner/repo not configured" };
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows?per_page=100`,
      { headers: headers(token) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: describeGithubStatus(res.status, body) };
    }
    const json: unknown = await res.json();
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
    return { ok: true, workflows };
  } catch (err: unknown) {
    return { ok: false, error: describeGithubError(err) };
  }
}

export async function fetchGithubWorkflowRuns(
  cfg: GithubCiConfig,
  options?: { perPage?: number },
): Promise<
  { ok: true; runs: GithubWorkflowRun[] } | { ok: false; error: string }
> {
  const { owner, repo, token } = cfg;
  if (!owner || !repo) {
    return { ok: false, error: "GitHub owner/repo not configured" };
  }
  const perPage = options?.perPage ?? 20;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=${perPage}`,
      { headers: headers(token) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: describeGithubStatus(res.status, body) };
    }
    const json: unknown = await res.json();
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
      const actor =
        r.actor && typeof r.actor === "object"
          ? (r.actor as { login?: unknown }).login
          : undefined;
      const triggering =
        r.triggering_actor && typeof r.triggering_actor === "object"
          ? (r.triggering_actor as { login?: unknown }).login
          : undefined;
      const login =
        typeof actor === "string"
          ? actor
          : typeof triggering === "string"
            ? triggering
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
        displayTitle:
          typeof r.display_title === "string"
            ? r.display_title
            : typeof r.name === "string"
              ? r.name
              : `#${r.id}`,
      });
    }
    return { ok: true, runs };
  } catch (err: unknown) {
    return { ok: false, error: describeGithubError(err) };
  }
}

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

/** GET /repos/{owner}/{repo} — validates access and returns default branch. */
export async function fetchGithubRepo(
  cfg: GithubCiConfig,
): Promise<{ ok: true; repo: GithubRepoInfo } | { ok: false; error: string }> {
  const { owner, repo, token } = cfg;
  if (!owner || !repo) {
    return { ok: false, error: "GitHub owner/repo not configured" };
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers: headers(token) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: describeGithubStatus(res.status, body) };
    }
    const json: unknown = await res.json();
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Unexpected GitHub repo payload" };
    }
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
      ok: true,
      repo: {
        owner,
        repo,
        private: row.private === true,
        defaultBranch,
        htmlUrl,
      },
    };
  } catch (err: unknown) {
    return { ok: false, error: describeGithubError(err) };
  }
}

/**
 * Test connection for Add Workflow modal: repo metadata + workflows list.
 */
export async function testGithubRepoConnection(cfg: GithubCiConfig): Promise<
  | {
      ok: true;
      repo: GithubRepoInfo;
      workflows: GithubWorkflowSummary[];
    }
  | { ok: false; error: string }
> {
  const repoRes = await fetchGithubRepo(cfg);
  if (!repoRes.ok) return repoRes;
  const wfRes = await fetchGithubWorkflows(cfg);
  if (!wfRes.ok) return wfRes;
  return { ok: true, repo: repoRes.repo, workflows: wfRes.workflows };
}

function workflowDispatchKey(
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
 * Build ordered workflow dispatch keys: numeric id → full path → basename.
 * Optionally resolves id via the workflows list when only a local path is known.
 */
async function resolveWorkflowDispatchKeys(
  input: DispatchWorkflowInput,
): Promise<string[]> {
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

  if (
    input.kind === "workflow_dispatch" &&
    typeof input.workflowId !== "number"
  ) {
    const listed = await fetchGithubWorkflows({
      owner: input.owner.trim(),
      repo: input.repo.trim(),
      ...(input.token?.trim() ? { token: input.token.trim() } : {}),
    });
    if (listed.ok && path) {
      const matched = matchRemoteWorkflowId(path, listed.workflows);
      if (matched !== undefined) {
        keys.unshift(String(matched));
        const wf = listed.workflows.find((w) => w.id === matched);
        if (wf?.path) {
          push(wf.path);
          push(wf.path.split("/").pop());
        }
      }
    }
  }

  return keys;
}

/**
 * Dispatch a workflow_dispatch or repository_dispatch event.
 * Prefers numeric workflow id; falls back to full path then basename.
 * Retries against the repo default branch when the preferred ref 404/422s.
 */
export async function dispatchGithubWorkflow(
  input: DispatchWorkflowInput,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const token = input.token?.trim();
  if (!owner || !repo) {
    return {
      ok: false,
      error: "Configure GitHub owner/repo under Integrations.",
    };
  }

  const hdrs: Record<string, string> = {
    ...headers(token),
    "Content-Type": "application/json",
  };

  const preferredRef = (input.ref ?? "").trim() || "main";
  let defaultBranch: string | null = null;

  const resolveDefault = async (): Promise<string> => {
    if (defaultBranch) return defaultBranch;
    const info = await fetchGithubRepo({
      owner,
      repo,
      ...(token ? { token } : {}),
    });
    defaultBranch = info.ok ? info.repo.defaultBranch : "main";
    return defaultBranch;
  };

  const postWorkflow = async (
    ref: string,
    key: string,
  ): Promise<{ ok: true } | { ok: false; status: number; body: string }> => {
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(key)}/dispatches`;
      const body = JSON.stringify({
        ref,
        inputs: input.inputs ?? {},
      });
      const res = await fetch(url, { method: "POST", headers: hdrs, body });
      if (res.ok || res.status === 204) return { ok: true };
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, body: text };
    } catch (err: unknown) {
      return { ok: false, status: 0, body: describeGithubError(err) };
    }
  };

  const postRepoDispatch = async (): Promise<
    { ok: true; ref: string } | { ok: false; error: string }
  > => {
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`;
      const body = JSON.stringify({
        event_type: (input.eventType ?? "").trim() || "prism-trigger",
      });
      const res = await fetch(url, { method: "POST", headers: hdrs, body });
      if (res.ok || res.status === 204) {
        return { ok: true, ref: preferredRef };
      }
      const text = await res.text().catch(() => "");
      return { ok: false, error: describeGithubStatus(res.status, text) };
    } catch (err: unknown) {
      return { ok: false, error: describeGithubError(err) };
    }
  };

  try {
    if (input.kind === "repository_dispatch") {
      return await postRepoDispatch();
    }

    const keys = await resolveWorkflowDispatchKeys(input);
    if (keys.length === 0) {
      return {
        ok: false,
        error: "Missing workflow id or path for workflow_dispatch.",
      };
    }

    const tryRef = async (
      ref: string,
    ): Promise<
      { ok: true; ref: string } | { ok: false; status: number; body: string }
    > => {
      let last: { status: number; body: string } = {
        status: 404,
        body: "",
      };
      for (const key of keys) {
        const result = await postWorkflow(ref, key);
        if (result.ok) return { ok: true, ref };
        last = { status: result.status, body: result.body };
        if (
          result.status === 401 ||
          result.status === 403 ||
          result.status === 429 ||
          result.status === 0
        ) {
          return { ok: false, status: result.status, body: result.body };
        }
      }
      return { ok: false, status: last.status, body: last.body };
    };

    const first = await tryRef(preferredRef);
    if (first.ok) return first;

    if (first.status === 401 || first.status === 403 || first.status === 429) {
      return {
        ok: false,
        error: describeGithubStatus(first.status, first.body),
      };
    }
    if (first.status === 0) {
      return { ok: false, error: first.body || "Couldn't reach GitHub." };
    }

    const fallback = await resolveDefault();
    if (fallback && fallback !== preferredRef) {
      const second = await tryRef(fallback);
      if (second.ok) return second;
      if (second.status === 0) {
        return { ok: false, error: second.body || "Couldn't reach GitHub." };
      }
      return {
        ok: false,
        error: describeGithubStatus(second.status, second.body),
      };
    }

    return {
      ok: false,
      error: describeGithubStatus(first.status, first.body),
    };
  } catch (err: unknown) {
    return { ok: false, error: describeGithubError(err) };
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

/** Friendly message for a non-2xx PageSpeed Insights response. */
function describePagespeedStatus(status: number, body: string): string {
  const detail = body ? `: ${body.slice(0, 160)}` : "";
  if (status === 400) {
    return "PageSpeed rejected the request (400) — the API key may be invalid or malformed.";
  }
  if (status === 403) {
    return "PageSpeed returned 403 — the key may be restricted, or the PageSpeed Insights API isn't enabled for this project.";
  }
  if (status === 429) {
    return "PageSpeed returned 429 — rate limit reached. Try again shortly.";
  }
  return `PageSpeed ${status}${detail}`;
}

/** Friendly message for a thrown PageSpeed fetch error. */
function describePagespeedError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Couldn't reach Google PageSpeed Insights (network request failed). Check your connection and that Settings → Allow network integrations is on.";
  }
  return err instanceof Error ? err.message : String(err);
}

/** PageSpeed Insights v5 (opt-in; requires API key + network gate). */
export async function fetchPagespeedMetrics(
  apiKey: string,
  url: string,
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  const key = apiKey.trim();
  const target = url.trim();
  if (!key) return { ok: false, error: "PageSpeed API key missing" };
  if (!target) return { ok: false, error: "Enter a URL to analyze" };
  try {
    const endpoint = new URL(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
    );
    endpoint.searchParams.set("url", target);
    endpoint.searchParams.set("key", key);
    endpoint.searchParams.set("category", "performance");
    endpoint.searchParams.set("strategy", "mobile");
    const res = await fetch(endpoint.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: describePagespeedStatus(res.status, body) };
    }
    return { ok: true, raw: await res.json() };
  } catch (err: unknown) {
    return { ok: false, error: describePagespeedError(err) };
  }
}
