/**
 * Consent-gated GitHub Actions network helpers (M-053 / ADR-0033).
 * Pure parse / DTO maps live in `@repo-prism/intelligence`.
 * Tokens are per-call only — never logged.
 */

import {
  collectWorkflowDispatchKeys,
  createConsentStore,
  mapGithubAuthenticatedLogin,
  mapGithubRepoInfo,
  mapGithubWorkflowRuns,
  mapGithubWorkflowSummaries,
  matchRemoteWorkflowId,
  type DispatchWorkflowInput,
  type GithubCiConfig,
  type GithubRepoInfo,
  type GithubWorkflowRun,
  type GithubWorkflowSummary,
} from "@repo-prism/intelligence";

export type {
  DispatchWorkflowInput,
  DispatchWorkflowKind,
  GithubCiConfig,
  GithubRepoInfo,
  GithubWorkflowRun,
  GithubWorkflowSummary,
} from "@repo-prism/intelligence";

export type GithubCiNetworkInput = GithubCiConfig & {
  readonly workspaceRoot: string;
};

export type DispatchGithubWorkflowInput = DispatchWorkflowInput & {
  readonly workspaceRoot: string;
};

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "prism-github-ci",
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
 * ("Failed to fetch") almost always means the request never left the host.
 */
function describeGithubError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Couldn't reach GitHub (network request failed). Check your connection and that network.github consent is granted.";
  }
  return err instanceof Error ? err.message : String(err);
}

async function requireGithubConsent(
  workspaceRoot: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await createConsentStore({ workspaceRoot }).requireGranted(
    "network.github",
  );
  if (!gate.ok) return { ok: false, error: gate.error.message };
  return { ok: true };
}

export async function fetchGithubAuthenticatedLogin(input: {
  readonly workspaceRoot: string;
  readonly token: string;
}): Promise<string | null> {
  const gate = await requireGithubConsent(input.workspaceRoot);
  if (!gate.ok) return null;
  if (!input.token.trim()) return null;
  try {
    const res = await fetch(`${API}/user`, {
      headers: headers(input.token),
    });
    if (!res.ok) return null;
    return mapGithubAuthenticatedLogin(await res.json());
  } catch {
    return null;
  }
}

export async function fetchGithubWorkflows(
  input: GithubCiNetworkInput,
): Promise<
  | { ok: true; workflows: GithubWorkflowSummary[] }
  | { ok: false; error: string }
> {
  const gate = await requireGithubConsent(input.workspaceRoot);
  if (!gate.ok) return gate;

  const { owner, repo, token } = input;
  if (!owner || !repo) {
    return { ok: false, error: "GitHub owner/repo not configured" };
  }
  try {
    const res = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows?per_page=100`,
      { headers: headers(token) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: describeGithubStatus(res.status, body) };
    }
    return {
      ok: true,
      workflows: mapGithubWorkflowSummaries(await res.json()),
    };
  } catch (err: unknown) {
    return { ok: false, error: describeGithubError(err) };
  }
}

export async function fetchGithubWorkflowRuns(
  input: GithubCiNetworkInput & { readonly perPage?: number },
): Promise<
  { ok: true; runs: GithubWorkflowRun[] } | { ok: false; error: string }
> {
  const gate = await requireGithubConsent(input.workspaceRoot);
  if (!gate.ok) return gate;

  const { owner, repo, token } = input;
  if (!owner || !repo) {
    return { ok: false, error: "GitHub owner/repo not configured" };
  }
  const perPage = input.perPage ?? 20;
  try {
    const res = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=${perPage}`,
      { headers: headers(token) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: describeGithubStatus(res.status, body) };
    }
    return { ok: true, runs: mapGithubWorkflowRuns(await res.json()) };
  } catch (err: unknown) {
    return { ok: false, error: describeGithubError(err) };
  }
}

/** GET /repos/{owner}/{repo} — validates access and returns default branch. */
export async function fetchGithubRepo(
  input: GithubCiNetworkInput,
): Promise<{ ok: true; repo: GithubRepoInfo } | { ok: false; error: string }> {
  const gate = await requireGithubConsent(input.workspaceRoot);
  if (!gate.ok) return gate;

  const { owner, repo, token } = input;
  if (!owner || !repo) {
    return { ok: false, error: "GitHub owner/repo not configured" };
  }
  try {
    const res = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers: headers(token) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: describeGithubStatus(res.status, body) };
    }
    const mapped = mapGithubRepoInfo(await res.json(), owner, repo);
    if (!mapped) {
      return { ok: false, error: "Unexpected GitHub repo payload" };
    }
    return { ok: true, repo: mapped };
  } catch (err: unknown) {
    return { ok: false, error: describeGithubError(err) };
  }
}

/**
 * Test connection for Add Workflow modal: repo metadata + workflows list.
 */
export async function testGithubRepoConnection(
  input: GithubCiNetworkInput,
): Promise<
  | {
      ok: true;
      repo: GithubRepoInfo;
      workflows: GithubWorkflowSummary[];
    }
  | { ok: false; error: string }
> {
  const repoRes = await fetchGithubRepo(input);
  if (!repoRes.ok) return repoRes;
  const wfRes = await fetchGithubWorkflows(input);
  if (!wfRes.ok) return wfRes;
  return { ok: true, repo: repoRes.repo, workflows: wfRes.workflows };
}

async function resolveWorkflowDispatchKeys(
  input: DispatchGithubWorkflowInput,
): Promise<string[]> {
  const keys = collectWorkflowDispatchKeys(input);
  const path = (input.workflowPath ?? "").trim().replace(/^\/+/, "");

  if (
    input.kind === "workflow_dispatch" &&
    typeof input.workflowId !== "number"
  ) {
    const listed = await fetchGithubWorkflows({
      workspaceRoot: input.workspaceRoot,
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
          for (const extra of [wf.path, wf.path.split("/").pop()]) {
            if (extra && !keys.includes(extra)) keys.push(extra);
          }
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
  input: DispatchGithubWorkflowInput,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const gate = await requireGithubConsent(input.workspaceRoot);
  if (!gate.ok) return gate;

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
      workspaceRoot: input.workspaceRoot,
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
      const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(key)}/dispatches`;
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
      const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`;
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
