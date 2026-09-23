/**
 * GitLens-style commit-lane layout. Newest commit is row 0 (top).
 * First-parent stays on the same lane; extra parents open a new lane.
 */

export type GitGraphCommit = {
  readonly sha: string;
  readonly parents: readonly string[];
  readonly refs: readonly string[];
  readonly subject: string;
  readonly at: string;
};

export type GitGraphNode = {
  readonly sha: string;
  readonly row: number;
  readonly lane: number;
  readonly refs: readonly string[];
  readonly subject: string;
  readonly at: string;
  readonly isHead: boolean;
};

export type GitGraphEdge = {
  readonly fromRow: number;
  readonly fromLane: number;
  readonly toRow: number;
  readonly toLane: number;
  readonly lane: number;
};

export type GitGraphLayout = {
  readonly nodes: readonly GitGraphNode[];
  readonly edges: readonly GitGraphEdge[];
  readonly lanes: number;
};

const MAX_LANES = 8;

export function layoutGitGraph(
  commits: readonly GitGraphCommit[],
): GitGraphLayout {
  const bySha = new Map<string, GitGraphCommit>();
  for (const commit of commits) {
    if (!bySha.has(commit.sha)) bySha.set(commit.sha, commit);
  }
  const ordered = [...bySha.values()];
  const lanes: Array<string | null> = [];
  const placed = new Map<string, GitGraphNode>();
  const edges: GitGraphEdge[] = [];

  const occupy = (sha: string): number => {
    const existing = lanes.indexOf(sha);
    if (existing >= 0) return existing;
    const empty = lanes.indexOf(null);
    if (empty >= 0) {
      lanes[empty] = sha;
      return empty;
    }
    if (lanes.length >= MAX_LANES) return lanes.length - 1;
    lanes.push(sha);
    return lanes.length - 1;
  };

  ordered.forEach((commit, row) => {
    const lane = occupy(commit.sha);
    const refs = commit.refs;
    placed.set(commit.sha, {
      sha: commit.sha,
      row,
      lane,
      refs,
      subject: commit.subject,
      at: commit.at,
      isHead: refs.some((ref) => ref === "HEAD" || ref.startsWith("HEAD ->")),
    });

    const parents = commit.parents.filter((sha) => bySha.has(sha));
    const first = parents[0];
    if (first) {
      if (lanes[lane] === commit.sha) lanes[lane] = first;
      occupy(first);
    } else if (lanes[lane] === commit.sha) {
      lanes[lane] = null;
    }
    for (const parent of parents.slice(1)) {
      occupy(parent);
    }
  });

  for (const commit of ordered) {
    const from = placed.get(commit.sha);
    if (!from) continue;
    for (const parentSha of commit.parents) {
      const to = placed.get(parentSha);
      if (!to) continue;
      edges.push({
        fromRow: from.row,
        fromLane: from.lane,
        toRow: to.row,
        toLane: to.lane,
        lane: from.lane,
      });
    }
  }

  return {
    nodes: ordered
      .map((commit) => placed.get(commit.sha))
      .filter((node): node is GitGraphNode => node !== undefined),
    edges,
    lanes: Math.max(1, lanes.length),
  };
}

export const GIT_GRAPH_LANE_COLORS = [
  "#00c2c2",
  "#38bdf8",
  "#a78bfa",
  "#f59e0b",
  "#34d399",
  "#f472b6",
  "#fb7185",
  "#94a3b8",
] as const;

export function gitGraphLaneColor(lane: number): string {
  return (
    GIT_GRAPH_LANE_COLORS[lane % GIT_GRAPH_LANE_COLORS.length] ?? "#00c2c2"
  );
}

/** `HEAD -> feat/x` / `origin/feat/x` → `feat/x`. Tags are ignored. */
export function gitRefBranch(ref: string): string | undefined {
  const trimmed = ref.trim();
  if (!trimmed || trimmed === "HEAD" || /^tag:/i.test(trimmed)) {
    return undefined;
  }
  const fromHead = /^HEAD\s*->\s*(.+)$/.exec(trimmed);
  const raw = (fromHead?.[1] ?? trimmed)
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/[^/]+\//, "")
    .replace(/^origin\//, "");
  return raw || undefined;
}

export function worktreeColorMap(
  trees: readonly { readonly branch: string }[],
): ReadonlyMap<string, string> {
  const colors = new Map<string, string>();
  trees.forEach((tree, index) => {
    const branch = tree.branch.trim();
    if (!branch || colors.has(branch)) return;
    colors.set(branch, gitGraphLaneColor(index));
  });
  return colors;
}

export function colorForRefs(
  refs: readonly string[],
  colors: ReadonlyMap<string, string>,
): string | undefined {
  for (const ref of refs) {
    const branch = gitRefBranch(ref);
    if (branch && colors.has(branch)) return colors.get(branch);
  }
  return undefined;
}

/** Paint each worktree tip, then inherit that color down first-parent history. */
export function colorGitGraphNodes(
  commits: readonly GitGraphCommit[],
  layout: GitGraphLayout,
  trees: readonly { readonly branch: string }[],
): ReadonlyMap<string, string> {
  const byBranch = worktreeColorMap(trees);
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]));
  const painted = new Map<string, string>();
  for (const node of layout.nodes) {
    const matched = colorForRefs(node.refs, byBranch);
    if (matched) painted.set(node.sha, matched);
  }
  for (const node of layout.nodes) {
    const color = painted.get(node.sha);
    if (!color) continue;
    let parent = bySha.get(node.sha)?.parents[0];
    while (parent && !painted.has(parent)) {
      painted.set(parent, color);
      parent = bySha.get(parent)?.parents[0];
    }
  }
  for (const node of layout.nodes) {
    if (!painted.has(node.sha))
      painted.set(node.sha, gitGraphLaneColor(node.lane));
  }
  return painted;
}

export const GIT_GRAPH_ROW = 22;
export const GIT_GRAPH_LANE_W = 14;
export const GIT_GRAPH_PAD_X = 10;
export const GIT_GRAPH_PAD_Y = 10;
export const GIT_GRAPH_DOT = 4.5;

export function gitGraphPoint(
  row: number,
  lane: number,
): { readonly x: number; readonly y: number } {
  return {
    x: GIT_GRAPH_PAD_X + lane * GIT_GRAPH_LANE_W,
    y: GIT_GRAPH_PAD_Y + row * GIT_GRAPH_ROW,
  };
}

export function gitGraphSize(layout: GitGraphLayout): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: GIT_GRAPH_PAD_X * 2 + Math.max(1, layout.lanes) * GIT_GRAPH_LANE_W,
    height:
      GIT_GRAPH_PAD_Y * 2 +
      Math.max(0, layout.nodes.length - 1) * GIT_GRAPH_ROW +
      GIT_GRAPH_DOT * 2,
  };
}

export function gitGraphEdgePath(edge: GitGraphEdge): string {
  const from = gitGraphPoint(edge.fromRow, edge.fromLane);
  const to = gitGraphPoint(edge.toRow, edge.toLane);
  if (from.x === to.x) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  const midY = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
}
