/**
 * Jobs, skills, envelope, and prepare — served from this Dashboard process.
 * Disk is the source of truth; the hub daemon is not required to read them.
 */
import type { IncomingMessage } from "node:http";
import { basename, resolve } from "node:path";
import { defaultPlaygroundRoot, loadHubRegistrySync } from "./hub-registry.ts";

type ApiRes = {
  statusCode: number;
  setHeader: (k: string, v: string) => void;
  end: (body: string) => void;
};

function sendJson(res: ApiRes, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function workspaceFrom(
  search: string,
  body?: { workspace?: unknown; root?: unknown },
): string {
  const params = searchParams(search);
  const fromQuery =
    params.get("workspace")?.trim() || params.get("root")?.trim();
  if (fromQuery) return resolve(fromQuery);
  if (typeof body?.workspace === "string" && body.workspace.trim()) {
    return resolve(body.workspace.trim());
  }
  if (typeof body?.root === "string" && body.root.trim()) {
    return resolve(body.root.trim());
  }
  const fallback = defaultPlaygroundRoot();
  return fallback ? resolve(fallback) : "";
}

function jobWorkspaceRoots(search: string): string[] {
  const params = searchParams(search);
  const one = params.get("workspace")?.trim() || params.get("root")?.trim();
  if (one) return [resolve(one)];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | undefined): void => {
    const next = raw?.trim();
    if (!next) return;
    const resolved = resolve(next);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    out.push(resolved);
  };
  const registry = loadHubRegistrySync();
  add(registry.selectedPath);
  for (const row of registry.workspaces ?? []) add(row.path);
  add(defaultPlaygroundRoot());
  return out;
}

export function isDashboardDataPath(pathname: string, method: string): boolean {
  const verb = method.toUpperCase();
  if (pathname === "/api/jobs" && verb === "GET") return true;
  if (pathname === "/api/skills") return verb === "GET" || verb === "POST";
  if (pathname === "/api/envelope" && verb === "GET") return true;
  if (pathname === "/api/prepare-history" && verb === "GET") return true;
  if (pathname === "/api/prepare-last" && verb === "GET") return true;
  if (pathname === "/api/settings") return verb === "GET" || verb === "POST";
  if (pathname === "/api/connectors" && verb === "GET") return true;
  if (pathname === "/api/trees") return verb === "GET" || verb === "POST";
  if (pathname === "/api/git-graph" && verb === "GET") return true;
  return false;
}

export async function serveDashboardData(
  req: IncomingMessage,
  res: ApiRes,
  pathname: string,
  search: string,
  readJsonBody: (req: IncomingMessage) => Promise<unknown>,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  if (!isDashboardDataPath(pathname, method)) return false;

  try {
    if (pathname === "/api/settings" || pathname === "/api/connectors") {
      return await serveSettings(req, res, pathname, search, readJsonBody);
    }
    if (pathname === "/api/jobs") {
      await serveJobs(res, search);
      return true;
    }
    if (pathname === "/api/skills") {
      await serveSkills(req, res, readJsonBody);
      return true;
    }
    if (pathname === "/api/envelope") {
      await serveEnvelope(res, search);
      return true;
    }
    if (
      pathname === "/api/prepare-history" ||
      pathname === "/api/prepare-last"
    ) {
      await servePrepare(res, pathname, search);
      return true;
    }
    if (pathname === "/api/trees") {
      await serveTrees(req, res, search, readJsonBody);
      return true;
    }
    if (pathname === "/api/git-graph") {
      await serveGitGraph(res, search);
      return true;
    }
  } catch (cause) {
    sendJson(res, 500, {
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return true;
  }
  return false;
}

async function serveSettings(
  req: IncomingMessage,
  res: ApiRes,
  pathname: string,
  search: string,
  readJsonBody: (req: IncomingMessage) => Promise<unknown>,
): Promise<boolean> {
  const workspace = workspaceFrom(search);
  if (pathname === "/api/connectors") {
    const { discoverHostConnectors, vendorCoverage } =
      await import("../../packages/dispatch/src/host-connectors.ts");
    const discovery = await discoverHostConnectors(
      workspace ? { workspaceRoot: workspace } : {},
    );
    sendJson(res, 200, {
      connectors: discovery.connectors,
      unreadable: discovery.unreadable,
      vendors: vendorCoverage(discovery.connectors),
      asOf: new Date().toISOString(),
    });
    return true;
  }
  if (!workspace) {
    sendJson(res, 400, { error: "workspace is required" });
    return true;
  }
  if ((req.method ?? "GET").toUpperCase() === "POST") {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const { saveConfig } =
      await import("../../packages/dispatch/src/config.ts");
    const config = await saveConfig(workspace, body);
    sendJson(res, 200, { workspace, config });
    return true;
  }
  const { loadConfig } = await import("../../packages/dispatch/src/config.ts");
  const config = await loadConfig(workspace);
  sendJson(res, 200, { workspace, label: basename(workspace), config });
  return true;
}

async function serveJobs(res: ApiRes, search: string): Promise<void> {
  const { reapJobs } = await import("../../packages/dispatch/src/run-state.ts");
  const { readEnvelopeLedger, summarizeJobEnvelope } =
    await import("../../packages/core/src/envelope/envelope-ledger.ts");
  const { toSnapshot } =
    await import("../../packages/dispatch-hub/src/snapshot.ts");
  const jobs: unknown[] = [];
  const errors: {
    workspacePath: string;
    workspaceLabel: string;
    detail: string;
  }[] = [];
  for (const root of jobWorkspaceRoots(search)) {
    try {
      const records = await reapJobs(root);
      const ledger = await readEnvelopeLedger(root);
      for (const record of records) {
        const envelope = summarizeJobEnvelope(ledger, record.id);
        jobs.push(
          toSnapshot(
            record,
            root,
            envelope.available
              ? {
                  bytesKeptRatio: envelope.bytesKeptRatio,
                  tokensSaved: envelope.tokensSaved,
                  calls: envelope.calls,
                }
              : undefined,
          ),
        );
      }
    } catch (cause) {
      errors.push({
        workspacePath: root,
        workspaceLabel: basename(root),
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  sendJson(res, 200, {
    jobs,
    asOf: new Date().toISOString(),
    errors,
  });
}

async function serveSkills(
  req: IncomingMessage,
  res: ApiRes,
  readJsonBody: (req: IncomingMessage) => Promise<unknown>,
): Promise<void> {
  const {
    deleteSkill,
    deleteSkillVersion,
    duplicateSkill,
    listSkillVersions,
    listSkills,
    readSkillVersion,
    revertSkillVersion,
    writeSkill,
  } = await import("../../packages/dispatch/src/skills.ts");
  if ((req.method ?? "GET").toUpperCase() === "GET") {
    sendJson(res, 200, { skills: await listSkills() });
    return;
  }
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const action = String(body.action ?? "save").trim();
  if (action === "delete") {
    const ok = await deleteSkill(String(body.name ?? ""));
    sendJson(res, ok ? 200 : 400, {
      ok,
      detail: ok ? "Deleted." : "Could not delete that skill.",
    });
    return;
  }
  if (action === "duplicate") {
    const copied = await duplicateSkill(String(body.name ?? ""));
    if ("error" in copied) {
      sendJson(res, 400, copied);
      return;
    }
    sendJson(res, 200, copied);
    return;
  }
  if (action === "versions") {
    const listed = await listSkillVersions(String(body.name ?? ""));
    if ("error" in listed) {
      sendJson(res, 400, listed);
      return;
    }
    sendJson(res, 200, { versions: listed });
    return;
  }
  if (action === "version") {
    const version = await readSkillVersion(
      String(body.name ?? ""),
      String(body.versionId ?? ""),
    );
    if ("error" in version) {
      sendJson(res, 400, version);
      return;
    }
    sendJson(res, 200, version);
    return;
  }
  if (action === "revert_version") {
    const reverted = await revertSkillVersion(
      String(body.name ?? ""),
      String(body.versionId ?? ""),
    );
    if ("error" in reverted) {
      sendJson(res, 400, reverted);
      return;
    }
    sendJson(res, 200, reverted);
    return;
  }
  if (action === "delete_version") {
    const result = await deleteSkillVersion(
      String(body.name ?? ""),
      String(body.versionId ?? ""),
    );
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }
  const saved = await writeSkill({
    name: String(body.name ?? ""),
    description: String(body.description ?? ""),
    body: String(body.body ?? ""),
    status: body.status === "published" ? "published" : "draft",
    ...(String(body.previousName ?? "").trim()
      ? { previousName: String(body.previousName).trim() }
      : {}),
  });
  sendJson(res, "error" in saved ? 400 : 200, saved);
}

async function serveEnvelope(res: ApiRes, search: string): Promise<void> {
  const workspace = workspaceFrom(search);
  if (!workspace) {
    sendJson(res, 400, { error: "workspace is required" });
    return;
  }
  const params = searchParams(search);
  const grainRaw = params.get("grain")?.trim();
  const grain =
    grainRaw === "daily" ||
    grainRaw === "weekly" ||
    grainRaw === "monthly" ||
    grainRaw === "overall"
      ? grainRaw
      : undefined;
  const fromMs = parseBound(params.get("from"), false);
  const toMs = parseBound(params.get("to"), true);
  const { readEnvelopeLedger, summarizeEnvelopeLedger } =
    await import("../../packages/core/src/envelope/envelope-ledger.ts");
  const metrics = summarizeEnvelopeLedger(
    await readEnvelopeLedger(workspace),
    Date.now(),
    {
      ...(grain ? { grain } : {}),
      ...(fromMs !== undefined ? { fromMs } : {}),
      ...(toMs !== undefined ? { toMs } : {}),
    },
  );
  sendJson(res, 200, {
    workspace,
    ...metrics,
    asOf: new Date().toISOString(),
  });
}

async function servePrepare(
  res: ApiRes,
  pathname: string,
  search: string,
): Promise<void> {
  const workspace = workspaceFrom(search);
  if (!workspace) {
    sendJson(res, 400, { error: "workspace is required" });
    return;
  }
  const { readLastPrepareChange, readPrepareHistory } =
    await import("../../packages/core/src/envelope/prepare-last.ts");
  if (pathname === "/api/prepare-last") {
    const last = await readLastPrepareChange(workspace);
    sendJson(res, 200, {
      workspace,
      last: last ?? null,
      asOf: new Date().toISOString(),
    });
    return;
  }
  sendJson(res, 200, {
    workspace,
    runs: await readPrepareHistory(workspace),
    asOf: new Date().toISOString(),
  });
}

async function serveTrees(
  req: IncomingMessage,
  res: ApiRes,
  search: string,
  readJsonBody: (req: IncomingMessage) => Promise<unknown>,
): Promise<void> {
  const { collectRepoTrees, runTreeAction } =
    await import("../../packages/dispatch-hub/src/trees.ts");
  const { reapJobs } = await import("../../packages/dispatch/src/run-state.ts");
  if ((req.method ?? "GET").toUpperCase() === "POST") {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const workspace = workspaceFrom(search, body);
    const treePath = String(body.treePath ?? "").trim();
    const action = String(body.action ?? "").trim();
    if (
      !workspace ||
      !treePath ||
      (action !== "merge" &&
        action !== "commit" &&
        action !== "push" &&
        action !== "remove")
    ) {
      sendJson(res, 400, {
        error: "workspace, treePath, and action are required",
      });
      return;
    }
    const result = await runTreeAction({
      workspacePath: workspace,
      treePath,
      action,
      ...(typeof body.branch === "string" ? { branch: body.branch } : {}),
      ...(typeof body.jobId === "string" ? { jobId: body.jobId } : {}),
      ...(typeof body.title === "string" ? { title: body.title } : {}),
    });
    sendJson(res, 200, result);
    return;
  }
  const roots = jobWorkspaceRoots(search);
  const force = searchParams(search).get("fresh") === "1";
  const repos = await Promise.all(
    roots.map(async (root) => {
      const records = await reapJobs(root).catch(() => []);
      return collectRepoTrees(
        {
          workspacePath: root,
          label: basename(root),
          jobs: records.map((job) => ({
            id: job.id,
            title: job.title,
            status: job.status,
            playbook: job.playbook,
            worktreePath: job.worktreePath,
            workspacePath: root,
          })),
        },
        { force },
      );
    }),
  );
  sendJson(res, 200, { repos });
}

async function serveGitGraph(res: ApiRes, search: string): Promise<void> {
  const workspace = workspaceFrom(search);
  if (!workspace) {
    sendJson(res, 400, { error: "workspace is required" });
    return;
  }
  const { execFileSync } = await import("node:child_process");
  const run = (args: string[]): string | null => {
    try {
      return execFileSync("git", ["-C", workspace, ...args], {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        timeout: 8_000,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };
  const inside = run(["rev-parse", "--is-inside-work-tree"]);
  if (!inside || inside.trim() !== "true") {
    sendJson(res, 200, { commits: [] });
    return;
  }
  const { collectRepoTrees } =
    await import("../../packages/dispatch-hub/src/trees.ts");
  const trees = await collectRepoTrees({
    workspacePath: workspace,
    label: basename(workspace),
    jobs: [],
  });
  const branches = [
    "HEAD",
    ...trees.trees
      .map((tree) => tree.branch.trim())
      .filter((branch) => branch.length > 0),
  ];
  const unique = [...new Set(branches)];
  const stdout = run([
    "log",
    "--decorate=short",
    "--pretty=format:%H%x1f%P%x1f%D%x1f%s%x1f%aI",
    "--max-count=28",
    ...unique,
  ]);
  if (!stdout) {
    sendJson(res, 200, { commits: [] });
    return;
  }
  const seen = new Set<string>();
  const commits: {
    sha: string;
    parents: string[];
    refs: string[];
    subject: string;
    at: string;
  }[] = [];
  for (const line of stdout.split("\n")) {
    const parts = line.split("\u001f");
    const sha = parts[0]?.trim();
    if (!sha || seen.has(sha)) continue;
    seen.add(sha);
    const parents = (parts[1] ?? "")
      .trim()
      .split(/\s+/)
      .filter((parent) => parent.length > 0);
    const refs = (parts[2] ?? "")
      .split(",")
      .map((ref) => ref.trim())
      .filter((ref) => ref.length > 0);
    commits.push({
      sha,
      parents,
      refs,
      subject: (parts[3] ?? "").trim(),
      at: (parts[4] ?? "").trim(),
    });
  }
  sendJson(res, 200, { commits });
}

function parseBound(raw: string | null, endOfDay: boolean): number | undefined {
  if (!raw?.trim()) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  if (!endOfDay) return ms;
  const day = new Date(ms);
  day.setHours(23, 59, 59, 999);
  return day.getTime();
}

export const dashboardApisForTest = {
  isDashboardDataPath,
  jobWorkspaceRoots,
  workspaceFrom,
};
