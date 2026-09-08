import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  ListTile,
  Pip,
  Truncate,
} from "@repo-prism/ui";
import type { JobWorkspaceChip } from "@repo-prism/app-shell";
import {
  Anchor,
  CheckCircle2,
  Copy,
  ExternalLink,
  Folder,
  GitBranch,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { showConsoleToast } from "./console-toast.js";
import { getJson, postJson } from "./session.js";

type TreeJobRow = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
};

type RepoTree = {
  readonly path: string;
  readonly branch: string;
  readonly source: string;
  readonly kind: "primary" | "linked";
  readonly dirty: boolean;
  readonly files: number;
  readonly jobCount: number;
  readonly jobs: readonly TreeJobRow[];
  readonly jobId?: string;
  readonly jobTitle?: string;
  readonly jobStatus?: string;
};

type RepoTrees = {
  readonly path: string;
  readonly label: string;
  readonly trees: readonly RepoTree[];
};

function openInIde(path: string): void {
  window.location.href = `cursor://file${path}`;
}

function isWorking(status?: string): boolean {
  return status === "running" || status === "booting" || status === "ready";
}

function isCompact(tree: RepoTree, selected: boolean): boolean {
  if (tree.kind === "primary" || selected) return false;
  if (tree.dirty || tree.files > 0) return false;
  return !isWorking(tree.jobStatus);
}

function treeLabel(tree: RepoTree, repoLabel: string): string {
  if (tree.kind === "primary") {
    return `${repoLabel} · ${tree.branch || "HEAD"}`;
  }
  const leaf = tree.path.split("/").filter(Boolean).at(-1);
  return tree.branch || leaf || "linked tree";
}

function displayPath(path: string): string {
  const marker = "/.prism/";
  const at = path.indexOf(marker);
  if (at >= 0) return `...${path.slice(at)}`;
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

function jobVisual(status: string): {
  readonly pip: "emerald" | "rose" | "accent" | "amber" | "muted";
  readonly tone: "emerald" | "rose" | "accent" | "amber" | "neutral";
  readonly label: string;
} {
  if (status === "done") {
    return { pip: "emerald", tone: "emerald", label: "Success" };
  }
  if (status === "failed") {
    return { pip: "rose", tone: "rose", label: "Failed" };
  }
  if (isWorking(status)) {
    return { pip: "accent", tone: "accent", label: "Working" };
  }
  if (status === "needs_review") {
    return { pip: "amber", tone: "amber", label: "Review" };
  }
  if (status === "queued") {
    return { pip: "muted", tone: "neutral", label: "Queued" };
  }
  return { pip: "muted", tone: "neutral", label: status };
}

export function TreesView(props: {
  readonly token: string;
  readonly repos: readonly JobWorkspaceChip[];
  readonly repoFilter?: string;
  readonly onOpenJob?: (jobId: string) => void;
}): ReactElement {
  const [ledger, setLedger] = useState<readonly RepoTrees[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | undefined>(
    props.repoFilter,
  );
  const [selectedTree, setSelectedTree] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | undefined>();

  const load = async (): Promise<void> => {
    const body = await getJson<{ repos: RepoTrees[] }>(
      "/api/trees",
      props.token,
    );
    setLedger(body.repos);
    setSelectedRepo((current) => {
      if (current && body.repos.some((row) => row.path === current)) {
        return current;
      }
      return props.repoFilter &&
        body.repos.some((row) => row.path === props.repoFilter)
        ? props.repoFilter
        : body.repos[0]?.path;
    });
  };

  useEffect(() => {
    void load().catch(() => undefined);
    const tick = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(tick);
  }, [props.token]);

  const active = ledger.find((row) => row.path === selectedRepo) ?? ledger[0];
  const primary = active?.trees.find((tree) => tree.kind === "primary");
  const inspect =
    active?.trees.find((tree) => tree.path === selectedTree) ??
    primary ??
    active?.trees[0];

  useEffect(() => {
    if (!active) {
      setSelectedTree(undefined);
      return;
    }
    setSelectedTree((current) => {
      if (current && active.trees.some((tree) => tree.path === current)) {
        return current;
      }
      return primary?.path ?? active.trees[0]?.path;
    });
  }, [active?.path, primary?.path]);

  const act = async (
    tree: RepoTree,
    action: "merge" | "commit" | "push" | "remove",
  ): Promise<void> => {
    if (!active) return;
    if (action === "remove" && !window.confirm("Remove this linked tree?")) {
      return;
    }
    if (
      action === "merge" &&
      !window.confirm(`Merge ${tree.branch} into the current checkout?`)
    ) {
      return;
    }
    setBusy(`${tree.path}:${action}`);
    try {
      const result = await postJson<{ ok: boolean; detail: string }>(
        "/api/trees",
        props.token,
        {
          workspace: active.path,
          treePath: tree.path,
          action,
          branch: tree.branch,
          jobId: tree.jobId,
          title: tree.jobTitle,
        },
      );
      showConsoleToast(result.detail, result.ok ? "ok" : "error");
      await load();
    } catch (cause) {
      showConsoleToast(
        cause instanceof Error ? cause.message : "Tree action failed.",
        "error",
      );
    } finally {
      setBusy(undefined);
    }
  };

  const copyPath = async (path: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path);
      showConsoleToast("Path copied.");
    } catch {
      showConsoleToast("Could not copy path.", "error");
    }
  };

  return (
    <div className="trees-layout">
      <aside className="trees-repos">
        <header className="trees-repos__head">
          <span>Repositories</span>
        </header>
        <div className="trees-repos__list">
          {ledger.length === 0 ? (
            <EmptyState>
              Add a repository to see its trees
              {props.repos.length > 0
                ? ` (${props.repos.length} registered).`
                : "."}
            </EmptyState>
          ) : (
            ledger.map((row) => {
              const on = row.path === active?.path;
              return (
                <ListTile
                  key={row.path}
                  selected={on}
                  className="tree-repo"
                  onClick={() => setSelectedRepo(row.path)}
                >
                  <Folder
                    size={16}
                    aria-hidden
                    className={
                      on
                        ? "tree-repo__icon tree-repo__icon--on"
                        : "tree-repo__icon"
                    }
                  />
                  <span className="tree-repo__copy">
                    <span className="tree-repo__name">{row.label}</span>
                    <span className="tree-repo__meta">
                      {`${row.trees.length} worktree${row.trees.length === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  {on ? <Pip tone="brand" size="sm" /> : null}
                </ListTile>
              );
            })
          )}
        </div>
      </aside>
      <section className="tree-map" aria-label="Worktree map">
        {!active ? (
          <EmptyState>No checkout selected.</EmptyState>
        ) : (
          <div className="tree-map__stack">
            <div className="tree-map__trunk" aria-hidden />
            {active.trees.map((tree) => {
              const selected = tree.path === inspect?.path;
              const compact = isCompact(tree, selected);
              const live = isWorking(tree.jobStatus);
              const label = treeLabel(tree, active.label);
              return (
                <ListTile
                  key={tree.path}
                  selected={selected}
                  className={[
                    "tree-node",
                    tree.kind === "primary"
                      ? "tree-node--primary"
                      : "tree-node--linked",
                    compact ? "tree-node--compact" : "",
                    live ? "tree-node--live" : "",
                    tree.dirty ? "tree-node--dirty" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedTree(tree.path)}
                >
                  {tree.kind === "linked" ? (
                    <span className="tree-map__branch" aria-hidden />
                  ) : null}
                  <span
                    className={
                      tree.kind === "primary"
                        ? "tree-node__dot tree-node__dot--primary"
                        : "tree-node__dot"
                    }
                  >
                    {tree.kind === "primary" ? (
                      <Anchor size={14} aria-hidden />
                    ) : (
                      <Folder size={14} aria-hidden />
                    )}
                  </span>
                  {compact ? (
                    <span className="tree-node__idle">
                      <Truncate title={label}>{label}</Truncate>
                    </span>
                  ) : (
                    <span className="tree-node__card">
                      <span className="tree-node__row">
                        <strong className="tree-node__name">
                          <Truncate title={label}>{label}</Truncate>
                        </strong>
                        {tree.kind === "primary" ? (
                          <Badge tone="brand" fill>
                            YOU
                          </Badge>
                        ) : live ? (
                          <span className="tree-node__live">
                            <Pip tone="accent" size="sm" pulse />
                            <span>Working</span>
                          </span>
                        ) : tree.dirty ? (
                          <Pip tone="amber" />
                        ) : null}
                      </span>
                      <span className="tree-node__meta">
                        {tree.kind === "primary" ? (
                          <>
                            <span>
                              {`${tree.jobCount} job${tree.jobCount === 1 ? "" : "s"} · ${tree.dirty ? "dirty" : "clean"}`}
                            </span>
                            {tree.dirty ? null : (
                              <CheckCircle2 size={14} aria-hidden />
                            )}
                          </>
                        ) : (
                          <>
                            <span
                              className={
                                tree.dirty ? "tree-node__dirty" : undefined
                              }
                            >
                              {tree.dirty
                                ? `dirty · ${tree.files} file${tree.files === 1 ? "" : "s"}`
                                : "clean"}
                            </span>
                            <span aria-hidden>·</span>
                            <span>
                              {`${tree.jobCount} job${tree.jobCount === 1 ? "" : "s"}`}
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  )}
                </ListTile>
              );
            })}
          </div>
        )}
        <p className="tree-map__caption">
          Each node is a git worktree (a checkout folder), not a branch in
          history. Removing a tree does not delete the branch.
        </p>
      </section>
      {inspect && active ? (
        <aside className="tree-inspector">
          <div className="tree-inspector__top">
            <div className="tree-inspector__kicker">
              <span className="tree-inspector__kind">
                {inspect.kind === "primary"
                  ? "This checkout"
                  : "Linked worktree"}
              </span>
              {inspect.kind === "linked" ? (
                <IconButton
                  label="Close inspector"
                  onClick={() => setSelectedTree(primary?.path)}
                >
                  <X size={18} />
                </IconButton>
              ) : null}
            </div>
            <h2>{treeLabel(inspect, active.label)}</h2>
            <div className="tree-inspector__path">
              <Folder size={16} aria-hidden />
              <Truncate title={inspect.path}>
                {displayPath(inspect.path)}
              </Truncate>
              <IconButton
                label="Copy path"
                onClick={() => void copyPath(inspect.path)}
              >
                <Copy size={16} />
              </IconButton>
            </div>
            <div className="tree-inspector__branch">
              <GitBranch size={14} aria-hidden />
              <span>{inspect.branch || "HEAD"}</span>
            </div>
            <div className="tree-inspector__stats">
              <div
                className="tree-inspector__stat"
                data-tone={inspect.dirty ? "amber" : undefined}
              >
                <span>Status</span>
                <strong
                  className={inspect.dirty ? "tree-node__dirty" : undefined}
                >
                  {inspect.dirty
                    ? `Dirty ${inspect.files} file${inspect.files === 1 ? "" : "s"}`
                    : "Clean"}
                </strong>
              </div>
              <div className="tree-inspector__stat">
                <span>Jobs</span>
                <strong>{inspect.jobCount}</strong>
              </div>
              <div className="tree-inspector__stat">
                <span>Live</span>
                <strong
                  className={
                    isWorking(inspect.jobStatus)
                      ? "tree-node__live-ink"
                      : undefined
                  }
                >
                  {isWorking(inspect.jobStatus)
                    ? (inspect.jobTitle ?? "Working")
                    : "none"}
                </strong>
              </div>
            </div>
          </div>
          <div className="tree-inspector__jobs">
            <h3>Jobs on this worktree</h3>
            {inspect.jobs.length === 0 ? (
              <EmptyState>No jobs on this worktree.</EmptyState>
            ) : (
              inspect.jobs.map((job) => {
                const visual = jobVisual(job.status);
                return (
                  <ListTile
                    key={job.id}
                    className="tree-job"
                    data-tone={visual.tone}
                    onClick={() => props.onOpenJob?.(job.id)}
                  >
                    <Pip
                      tone={visual.pip}
                      size="lg"
                      pulse={visual.pip === "accent"}
                    />
                    <span className="tree-job__title">
                      <Truncate title={job.title}>{job.title}</Truncate>
                    </span>
                    <Badge tone={visual.tone}>{visual.label}</Badge>
                  </ListTile>
                );
              })
            )}
          </div>
          <div className="tree-inspector__actions">
            {inspect.kind === "linked" && !isWorking(inspect.jobStatus) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={Boolean(busy)}
                onClick={() => void act(inspect, "merge")}
              >
                Merge into checkout
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => void act(inspect, "commit")}
            >
              Commit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => void act(inspect, "push")}
            >
              Push
            </Button>
            {inspect.kind === "linked" ? (
              <Button
                size="sm"
                variant="danger"
                className="tree-inspector__remove"
                disabled={Boolean(busy) || isWorking(inspect.jobStatus)}
                onClick={() => void act(inspect, "remove")}
              >
                Remove tree
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              onClick={() => openInIde(inspect.path)}
            >
              Open in IDE
              <ExternalLink size={16} aria-hidden />
            </Button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
