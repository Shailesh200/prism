import {
  Badge,
  EmptyState,
  HoverTip,
  IconButton,
  ListTile,
  Pip,
  Truncate,
  type ButtonVariant,
} from "@repo-prism/ui";
import type { JobWorkspaceChip } from "@repo-prism/app-shell";
import {
  Anchor,
  CheckCircle2,
  Copy,
  ExternalLink,
  Folder,
  GitBranch,
  GitCommit,
  GitMerge,
  Play,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
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
  if (status === "failed" || status === "error") {
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

function TreeIconAction(props: {
  readonly label: string;
  readonly detail: string;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <HoverTip
      label={props.label}
      detail={props.detail}
      {...(props.className ? { className: props.className } : {})}
    >
      <IconButton
        label={props.label}
        title=""
        variant={props.variant}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.children}
      </IconButton>
    </HoverTip>
  );
}

export function TreesView(props: {
  readonly token: string;
  readonly repos: readonly JobWorkspaceChip[];
  readonly repoFilter?: string;
  readonly filter?: string;
  readonly onOpenJob?: (jobId: string) => void;
  readonly onCompose?: (input: {
    readonly workspace: string;
    readonly placement: "checkout" | "worktree";
    readonly branch?: string;
    readonly worktreePath?: string;
  }) => void;
}): ReactElement {
  const [ledger, setLedger] = useState<readonly RepoTrees[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | undefined>(
    props.repoFilter,
  );
  const [selectedTree, setSelectedTree] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | undefined>();

  const load = async (): Promise<void> => {
    try {
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
    } finally {
      setReady(true);
    }
  };

  const hasLive = ledger.some((row) =>
    row.trees.some((tree) => isWorking(tree.jobStatus)),
  );

  useEffect(() => {
    void load().catch(() => undefined);
    const tick = window.setInterval(() => {
      void load().catch(() => undefined);
    }, hasLive ? 3000 : 8000);
    return () => window.clearInterval(tick);
  }, [props.token, hasLive]);

  const visible = useMemo(() => {
    const needle = (props.filter ?? "").trim().toLowerCase();
    if (!needle) return ledger;
    return ledger.filter(
      (row) =>
        row.label.toLowerCase().includes(needle) ||
        row.path.toLowerCase().includes(needle),
    );
  }, [ledger, props.filter]);

  const active = visible.find((row) => row.path === selectedRepo) ?? visible[0];
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

  const inspectJobs = inspect?.jobs ?? [];
  const liveOnTree = inspectJobs.filter((job) => isWorking(job.status));
  const failedOnTree = inspectJobs.filter(
    (job) => job.status === "failed" || job.status === "error",
  );

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
          {!ready ? (
            <EmptyState>Reading worktrees…</EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState>
              {ledger.length === 0
                ? `Add a repository to see its trees${
                    props.repos.length > 0
                      ? ` (${props.repos.length} registered).`
                      : "."
                  }`
                : "No repositories match this filter."}
            </EmptyState>
          ) : (
            visible.map((row) => {
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
        {!ready ? (
          <EmptyState>Reading worktrees…</EmptyState>
        ) : !active ? (
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
            <div className="tree-inspector__jobs-head">
              <h3>Jobs on this worktree</h3>
              {inspect.jobs.length > 0 ? (
                <span className="tree-inspector__job-counts">
                  {liveOnTree.length > 0
                    ? `${liveOnTree.length} live`
                    : "none live"}
                  {failedOnTree.length > 0
                    ? ` · ${failedOnTree.length} failed`
                    : ""}
                  {` · ${inspect.jobCount}`}
                </span>
              ) : null}
            </div>
            {liveOnTree.length > 0 ? (
              <div className="tree-inspector__live">
                <Pip tone="accent" pulse />
                <span>
                  {liveOnTree[0]?.title ?? "A job"} is working on this tree
                </span>
              </div>
            ) : null}
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
            {inspect.kind === "linked" ? (
              <TreeIconAction
                label="Remove tree"
                detail="Unlink this worktree. The branch stays."
                variant="danger"
                className="tree-inspector__remove"
                disabled={Boolean(busy) || isWorking(inspect.jobStatus)}
                onClick={() => void act(inspect, "remove")}
              >
                <Trash2 size={16} aria-hidden />
              </TreeIconAction>
            ) : (
              <span className="tree-inspector__remove" />
            )}
            {inspect.kind === "linked" && !isWorking(inspect.jobStatus) ? (
              <TreeIconAction
                label="Merge into checkout"
                detail={`Merge ${inspect.branch || "this branch"} into the current checkout`}
                disabled={Boolean(busy)}
                onClick={() => void act(inspect, "merge")}
              >
                <GitMerge size={16} aria-hidden />
              </TreeIconAction>
            ) : null}
            <TreeIconAction
              label="Commit"
              detail="Commit dirty files on this tree"
              disabled={Boolean(busy)}
              onClick={() => void act(inspect, "commit")}
            >
              <GitCommit size={16} aria-hidden />
            </TreeIconAction>
            <TreeIconAction
              label="Push"
              detail="Push this branch"
              disabled={Boolean(busy)}
              onClick={() => void act(inspect, "push")}
            >
              <Upload size={16} aria-hidden />
            </TreeIconAction>
            {props.onCompose ? (
              <TreeIconAction
                label="Dispatch here"
                detail={
                  inspect.kind === "primary"
                    ? "Queue a job in this checkout"
                    : `Queue a job on ${inspect.branch || "this worktree"}`
                }
                disabled={Boolean(busy)}
                onClick={() =>
                  props.onCompose?.({
                    workspace: active.path,
                    placement:
                      inspect.kind === "linked" ? "worktree" : "checkout",
                    ...(inspect.kind === "linked" && inspect.branch
                      ? { branch: inspect.branch }
                      : {}),
                    ...(inspect.kind === "linked"
                      ? { worktreePath: inspect.path }
                      : {}),
                  })
                }
              >
                <Play size={16} aria-hidden />
              </TreeIconAction>
            ) : null}
            <TreeIconAction
              label="Open in IDE"
              detail="Open this folder in Cursor"
              variant="primary"
              onClick={() => openInIde(inspect.path)}
            >
              <ExternalLink size={16} aria-hidden />
            </TreeIconAction>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
