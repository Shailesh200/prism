/**
 * Worktrees widget for DNA — primary checkout plus linked git worktrees.
 * Reads `/api/trees` on this Dashboard; no hub iframe.
 */
import {
  Badge,
  Button,
  EmptyState,
  HoverTip,
  IconButton,
  ScreenSkeleton,
  Text,
} from "@repo-prism/ui";
import {
  Copy,
  ExternalLink,
  Folder,
  GitBranch,
  GitMerge,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { showConsoleToast } from "./console-toast.js";
import { GitLineChart } from "./git-line-chart.js";
import {
  colorGitGraphNodes,
  layoutGitGraph,
  worktreeColorMap,
  type GitGraphCommit,
  type GitGraphNode,
} from "./git-graph.js";
import { getJson, postJson, readToken } from "./session.js";

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

function isWorking(status?: string): boolean {
  return status === "running" || status === "booting" || status === "ready";
}

function displayPath(path: string): string {
  const marker = "/.prism/";
  const at = path.indexOf(marker);
  if (at >= 0) return `…${path.slice(at)}`;
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 4) return path;
  return `…/${parts.slice(-3).join("/")}`;
}

function openInIde(path: string): void {
  window.location.href = `cursor://file${path}`;
}

function TreeAction(props: {
  readonly label: string;
  readonly detail: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly danger?: boolean;
  readonly primary?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <HoverTip label={props.label} detail={props.detail}>
      <IconButton
        label={props.label}
        {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
        {...(props.loading !== undefined ? { loading: props.loading } : {})}
        {...(props.danger ? { variant: "danger" as const } : {})}
        {...(props.primary ? { variant: "primary" as const } : {})}
        onClick={props.onClick}
      >
        {props.children}
      </IconButton>
    </HoverTip>
  );
}

export function TreesView(props: {
  readonly workspacePath: string;
  readonly repoLabel: string;
  readonly onOpenJob?: (jobId: string) => void;
}): ReactElement {
  const token = readToken();
  const [ledger, setLedger] = useState<RepoTrees | null>(null);
  const [commits, setCommits] = useState<readonly GitGraphCommit[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [focused, setFocused] = useState<GitGraphNode | null>(null);

  const load = async (fresh = false): Promise<void> => {
    try {
      const params = new URLSearchParams();
      params.set("workspace", props.workspacePath);
      if (fresh) params.set("fresh", "1");
      const body = await getJson<{ repos: RepoTrees[] }>(
        `/api/trees?${params.toString()}`,
        token,
      );
      const row =
        body.repos.find((repo) => repo.path === props.workspacePath) ??
        body.repos[0] ??
        null;
      setLedger(row);
      setLoadError(undefined);
      try {
        const graph = await getJson<{ commits: GitGraphCommit[] }>(
          `/api/git-graph?${params.toString()}`,
          token,
        );
        setCommits(graph.commits ?? []);
      } catch {
        setCommits([]);
      }
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "Could not read worktrees.",
      );
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    void load().catch(() => undefined);
    const tick = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 12_000);
    return () => window.clearInterval(tick);
  }, [props.workspacePath]);

  const act = async (
    tree: RepoTree,
    action: "merge" | "remove",
  ): Promise<void> => {
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
        token,
        {
          workspace: props.workspacePath,
          treePath: tree.path,
          action,
          branch: tree.branch,
          jobId: tree.jobId,
          title: tree.jobTitle,
        },
      );
      showConsoleToast(result.detail, result.ok ? "ok" : "error");
      await load(true);
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

  const trees = ledger?.trees ?? [];
  const treeColors = worktreeColorMap(trees);
  const commitColors = colorGitGraphNodes(
    commits,
    layoutGitGraph(commits),
    trees,
  );
  const focusedColor = focused ? commitColors.get(focused.sha) : undefined;

  return (
    <div className="dna-trees-widget">
      <div className="ov-card__head">
        <Text variant="card" as="span" className="ov-card__title">
          Trees
        </Text>
        {trees.length > 0 ? (
          <span className="ov-card__meta">
            {trees.length} worktree{trees.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {!ready ? (
        <ScreenSkeleton label="Reading worktrees…" rows={3} />
      ) : loadError ? (
        <div className="dna-trees-widget__empty">
          <EmptyState>{loadError}</EmptyState>
          <Button size="sm" variant="secondary" onClick={() => void load(true)}>
            Try again
          </Button>
        </div>
      ) : trees.length === 0 ? (
        <EmptyState>No git worktrees for this repository yet.</EmptyState>
      ) : (
        <div className="dna-trees-widget__body">
          {commits.length > 0 ? (
            <div className="dna-trees-widget__graph" aria-hidden={false}>
              <GitLineChart
                commits={commits}
                trees={trees}
                {...(focused ? { selectedSha: focused.sha } : {})}
                onSelect={setFocused}
              />
            </div>
          ) : null}
          <ul className="dna-trees-widget__list">
            {trees.map((tree) => {
              const live = isWorking(tree.jobStatus);
              const filesLabel = `${tree.files} file${tree.files === 1 ? "" : "s"}`;
              return (
                <li key={tree.path}>
                  <article
                    className="dna-tree"
                    data-kind={tree.kind}
                    data-dirty={tree.dirty ? "true" : undefined}
                    data-live={live ? "true" : undefined}
                    data-focus={
                      focusedColor &&
                      treeColors.get(tree.branch) === focusedColor
                        ? "true"
                        : undefined
                    }
                    style={
                      {
                        "--dna-tree-color":
                          treeColors.get(tree.branch) ??
                          "var(--prism-brand, #00c2c2)",
                      } as CSSProperties
                    }
                  >
                    <header className="dna-tree__head">
                      <div className="dna-tree__identity">
                        <span className="dna-tree__kicker">
                          {tree.kind === "primary"
                            ? props.repoLabel
                            : "Linked worktree"}
                        </span>
                        <h3 className="dna-tree__branch">
                          <GitBranch size={14} aria-hidden />
                          <span>{tree.branch || "HEAD"}</span>
                        </h3>
                      </div>
                      {tree.kind === "primary" ? (
                        <Badge tone="brand" fill>
                          YOU
                        </Badge>
                      ) : live ? (
                        <Badge tone="accent" pulse>
                          Working
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Linked</Badge>
                      )}
                    </header>
                    <p className="dna-tree__path" title={tree.path}>
                      <Folder size={13} aria-hidden />
                      <span>{displayPath(tree.path)}</span>
                    </p>
                    <div className="dna-tree__facts">
                      <Badge tone={tree.dirty ? "amber" : "emerald"}>
                        {tree.dirty ? `Dirty · ${filesLabel}` : "Clean"}
                      </Badge>
                      <Badge tone="neutral">
                        {tree.jobCount} job{tree.jobCount === 1 ? "" : "s"}
                      </Badge>
                      {tree.jobTitle && tree.jobId && props.onOpenJob ? (
                        <button
                          type="button"
                          className="dna-tree__job"
                          onClick={() => props.onOpenJob?.(tree.jobId!)}
                          title={tree.jobTitle}
                        >
                          {tree.jobTitle}
                        </button>
                      ) : null}
                    </div>
                    <footer className="dna-tree__actions">
                      <TreeAction
                        label="Copy path"
                        detail={tree.path}
                        onClick={() => void copyPath(tree.path)}
                      >
                        <Copy size={14} />
                      </TreeAction>
                      {tree.kind === "linked" ? (
                        <TreeAction
                          label="Merge into checkout"
                          detail={`Merge ${tree.branch || "this branch"} into the current checkout`}
                          disabled={Boolean(busy)}
                          loading={busy === `${tree.path}:merge`}
                          onClick={() => void act(tree, "merge")}
                        >
                          <GitMerge size={14} />
                        </TreeAction>
                      ) : null}
                      <TreeAction
                        label="Open in IDE"
                        detail="Open this folder in Cursor"
                        primary
                        onClick={() => openInIde(tree.path)}
                      >
                        <ExternalLink size={14} />
                      </TreeAction>
                      {tree.kind === "linked" ? (
                        <TreeAction
                          label="Remove tree"
                          detail="Unlink this worktree. The branch stays."
                          danger
                          disabled={Boolean(busy) || live}
                          loading={busy === `${tree.path}:remove`}
                          onClick={() => void act(tree, "remove")}
                        >
                          <Trash2 size={14} />
                        </TreeAction>
                      ) : null}
                    </footer>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
