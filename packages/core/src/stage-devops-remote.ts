/**
 * Stage DevOps signals from a foreign GitHub repo into
 * `.prism/remote-ci/<owner>/<repo>/` (M-046). No full Core index — only
 * selected workflow / deploy / k8s paths via the Contents + Tree API.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildUtilityOverlay } from "@prism/intelligence";
import type { StackProfile, UtilityOverlayReport } from "@prism/shared";

export type StageDevopsRemoteInput = {
  readonly workspaceRoot: string;
  readonly owner: string;
  readonly repo: string;
  readonly token?: string;
};

export type StagedWorkflowSummary = {
  readonly id?: number;
  readonly name: string;
  readonly path: string;
};

export type StageDevopsRemoteResult = {
  readonly stagedRoot: string;
  readonly paths: string[];
  readonly workflows: StagedWorkflowSummary[];
  readonly overlay: UtilityOverlayReport | null;
};

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

const DEPLOY_DIR_RE =
  /(^|\/)(k8s|kubernetes|helm|deploy|charts|argo|argocd)(\/|$)/i;
const ROOT_CI_FILE_RE =
  /^(Dockerfile[^/]*|Jenkinsfile|\.gitlab-ci\.ya?ml|docker-compose[^/]*\.ya?ml)$/i;
const ARGO_PATH_RE =
  /(application|applicationset|rollout|appproject)[^/]*\.ya?ml$/i;

function githubHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "prism-devops-stage",
  };
  if (token && token.trim() !== "") {
    h.Authorization = `Bearer ${token.trim()}`;
  }
  return h;
}

function shouldStagePath(path: string): boolean {
  const p = path.replace(/^\/+/, "");
  if (p.startsWith(".github/workflows/") && /\.ya?ml$/i.test(p)) return true;
  if (ROOT_CI_FILE_RE.test(p)) return true;
  if (DEPLOY_DIR_RE.test(p) && /\.ya?ml$/i.test(p)) return true;
  if (ARGO_PATH_RE.test(p)) return true;
  return false;
}

async function githubJson<T>(
  url: string,
  token?: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { headers: githubHeaders(token) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `GitHub ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function emptyStack(rootPath: string): StackProfile {
  return {
    rootPath,
    generatedAt: new Date().toISOString(),
    signals: [],
    domains: ["devops_platform"],
    personas: [],
    summary: "Staged remote DevOps tree (no full index)",
    packages: [],
  };
}

function parseWorkflowName(text: string, fallback: string): string {
  const m = /^name:[ \t]*(.+?)[ \t]*$/m.exec(text);
  return m?.[1]?.replace(/^['"]|['"]$/g, "").trim() || fallback;
}

/**
 * Fetch DevOps-related files from GitHub into
 * `.prism/remote-ci/<owner>/<repo>/` and optionally build an IaC overlay.
 */
export async function stageDevopsRemote(
  input: StageDevopsRemoteInput,
): Promise<
  { ok: true; value: StageDevopsRemoteResult } | { ok: false; error: string }
> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const token = input.token?.trim();
  if (!owner || !repo) {
    return { ok: false, error: "owner and repo are required" };
  }
  if (!input.workspaceRoot) {
    return { ok: false, error: "workspace root is required" };
  }

  const repoInfo = await githubJson<{
    default_branch?: string;
    private?: boolean;
  }>(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    token,
  );
  if (!repoInfo.ok) return repoInfo;
  const branch = repoInfo.data.default_branch || "main";

  const treeRes = await githubJson<{
    tree?: Array<{ path?: string; type?: string; sha?: string }>;
    truncated?: boolean;
  }>(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  if (!treeRes.ok) return treeRes;

  const candidates = (treeRes.data.tree ?? [])
    .filter(
      (t) =>
        t.type === "blob" &&
        typeof t.path === "string" &&
        shouldStagePath(t.path),
    )
    .map((t) => t.path!)
    .slice(0, 200);

  const relativeRoot = `.prism/remote-ci/${owner}/${repo}`;
  const absRoot = join(input.workspaceRoot, relativeRoot);
  const paths: string[] = [];
  const workflows: StagedWorkflowSummary[] = [];

  for (const rel of candidates) {
    const contentRes = await githubJson<{
      content?: string;
      encoding?: string;
      download_url?: string | null;
    }>(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${rel.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
      token,
    );
    if (!contentRes.ok) continue;
    let text = "";
    if (
      contentRes.data.encoding === "base64" &&
      typeof contentRes.data.content === "string"
    ) {
      text = Buffer.from(contentRes.data.content, "base64").toString("utf8");
    } else if (contentRes.data.download_url) {
      try {
        const raw = await fetch(contentRes.data.download_url, {
          headers: githubHeaders(token),
        });
        if (raw.ok) text = await raw.text();
      } catch {
        continue;
      }
    } else {
      continue;
    }

    const absFile = join(absRoot, rel);
    await mkdir(dirname(absFile), { recursive: true });
    await writeFile(absFile, text, "utf8");
    paths.push(rel);

    if (rel.startsWith(".github/workflows/") && /\.ya?ml$/i.test(rel)) {
      const base = rel.split("/").pop() ?? rel;
      workflows.push({
        name: parseWorkflowName(text, base.replace(/\.ya?ml$/i, "")),
        path: rel,
      });
    }
  }

  // Enrich workflow ids from Actions list when available.
  const wfList = await githubJson<{
    workflows?: Array<{
      id?: number;
      name?: string;
      path?: string;
      state?: string;
    }>;
  }>(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows?per_page=100`,
    token,
  );
  if (wfList.ok) {
    const byPath = new Map<string, { id: number; name: string }>();
    for (const w of wfList.data.workflows ?? []) {
      if (w.state === "deleted") continue;
      if (typeof w.id !== "number" || typeof w.path !== "string") continue;
      byPath.set(w.path, {
        id: w.id,
        name: typeof w.name === "string" ? w.name : w.path,
      });
    }
    for (let i = 0; i < workflows.length; i++) {
      const hit = byPath.get(workflows[i]!.path);
      if (hit) {
        workflows[i] = {
          id: hit.id,
          name: hit.name || workflows[i]!.name,
          path: workflows[i]!.path,
        };
      }
    }
    // Include remote-only workflows that weren't in the tree snapshot.
    for (const [path, hit] of byPath) {
      if (!workflows.some((w) => w.path === path)) {
        workflows.push({ id: hit.id, name: hit.name, path });
      }
    }
  }

  let overlay: UtilityOverlayReport | null = null;
  try {
    overlay = buildUtilityOverlay({
      workspaceRoot: absRoot,
      kind: "iac-resources",
      stack: emptyStack(absRoot),
    });
  } catch {
    overlay = null;
  }

  return {
    ok: true,
    value: {
      stagedRoot: relativeRoot,
      paths,
      workflows,
      overlay,
    },
  };
}
