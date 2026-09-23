import { useId, useState, type KeyboardEvent, type ReactElement } from "react";
import {
  GIT_GRAPH_DOT,
  colorGitGraphNodes,
  gitGraphEdgePath,
  gitGraphLaneColor,
  gitGraphPoint,
  gitGraphSize,
  gitRefBranch,
  layoutGitGraph,
  type GitGraphCommit,
  type GitGraphNode,
} from "./git-graph.js";

export type GitGraphTree = {
  readonly branch: string;
  readonly path?: string;
};

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function formatWhen(at: string): string {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return at;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GitLineChart(props: {
  readonly commits: readonly GitGraphCommit[];
  readonly trees?: readonly GitGraphTree[];
  readonly selectedSha?: string;
  readonly onSelect?: (node: GitGraphNode | null) => void;
  readonly className?: string;
}): ReactElement | null {
  const clipId = `dna-git-grow-${useId().replace(/:/g, "")}`;
  const [hoverSha, setHoverSha] = useState<string | undefined>();
  const layout = layoutGitGraph(props.commits);
  const colors = colorGitGraphNodes(props.commits, layout, props.trees ?? []);
  if (layout.nodes.length === 0) return null;
  const size = gitGraphSize(layout);
  const selected = props.selectedSha
    ? layout.nodes.find((node) => node.sha === props.selectedSha)
    : undefined;
  const hovered = hoverSha
    ? layout.nodes.find((node) => node.sha === hoverSha)
    : undefined;
  const active = hovered ?? selected;

  const select = (node: GitGraphNode): void => {
    if (props.selectedSha === node.sha) {
      props.onSelect?.(null);
      return;
    }
    props.onSelect?.(node);
  };

  const onDotKey = (
    event: KeyboardEvent<SVGGElement>,
    node: GitGraphNode,
  ): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(node);
    }
    if (event.key === "Escape") {
      props.onSelect?.(null);
    }
  };

  return (
    <div className="dna-git-graph-wrap">
      <svg
        className={["dna-git-graph", props.className].filter(Boolean).join(" ")}
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={`${layout.nodes.length} commits on ${layout.lanes} branch lane${layout.lanes === 1 ? "" : "s"}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onSelect?.(null);
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              className="dna-git-graph__grow"
              x="0"
              y="0"
              width={size.width}
              height={size.height}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {layout.edges.map((edge, i) => {
            const toNode = layout.nodes.find((node) => node.row === edge.toRow);
            const color =
              (toNode ? colors.get(toNode.sha) : undefined) ??
              gitGraphLaneColor(edge.toLane);
            const dim =
              Boolean(selected) &&
              edge.fromRow !== selected?.row &&
              edge.toRow !== selected?.row;
            return (
              <path
                key={`${edge.fromRow}-${edge.fromLane}-${edge.toRow}-${edge.toLane}-${i}`}
                className="dna-git-graph__line"
                d={gitGraphEdgePath(edge)}
                stroke={color}
                fill="none"
                strokeWidth="1.75"
                strokeLinecap="round"
                pathLength={1}
                opacity={dim ? 0.28 : 1}
              />
            );
          })}
          {layout.nodes.map((node) => {
            const pt = gitGraphPoint(node.row, node.lane);
            const color = colors.get(node.sha) ?? gitGraphLaneColor(node.lane);
            const focused = selected?.sha === node.sha;
            const lit = hoverSha === node.sha || focused;
            const r = focused
              ? GIT_GRAPH_DOT + 2.5
              : node.isHead
                ? GIT_GRAPH_DOT + 1.25
                : GIT_GRAPH_DOT;
            const dim = Boolean(selected) && !focused;
            return (
              <g
                key={node.sha}
                className="dna-git-graph__hit"
                role="button"
                tabIndex={0}
                aria-label={`${shortSha(node.sha)} ${node.subject}`}
                aria-pressed={focused}
                onMouseEnter={() => setHoverSha(node.sha)}
                onMouseLeave={() => setHoverSha(undefined)}
                onClick={(event) => {
                  event.stopPropagation();
                  select(node);
                }}
                onKeyDown={(event) => onDotKey(event, node)}
              >
                <circle
                  className="dna-git-graph__hitbox"
                  cx={pt.x}
                  cy={pt.y}
                  r="10"
                  fill="transparent"
                />
                <circle
                  className={
                    focused
                      ? "dna-git-graph__dot dna-git-graph__dot--focus"
                      : node.isHead
                        ? "dna-git-graph__dot dna-git-graph__dot--head"
                        : "dna-git-graph__dot"
                  }
                  cx={pt.x}
                  cy={pt.y}
                  r={r}
                  fill={
                    node.isHead || focused
                      ? "var(--prism-canvas, #0a0e1a)"
                      : color
                  }
                  stroke={color}
                  strokeWidth={focused ? 2.4 : node.isHead ? 2 : 1.5}
                  opacity={dim ? 0.35 : 1}
                  style={{
                    transform: lit ? "scale(1.15)" : undefined,
                  }}
                />
              </g>
            );
          })}
        </g>
      </svg>
      {active ? (
        <div
          className="dna-git-tip"
          data-focus={selected?.sha === active.sha ? "true" : undefined}
          role="status"
          style={{
            left: gitGraphPoint(active.row, active.lane).x + GIT_GRAPH_DOT + 10,
            top: gitGraphPoint(active.row, active.lane).y,
            ["--dna-git-tip-color" as string]:
              colors.get(active.sha) ?? "var(--prism-brand, #00c2c2)",
          }}
        >
          <span className="dna-git-tip__sha">{shortSha(active.sha)}</span>
          <strong className="dna-git-tip__subject">{active.subject}</strong>
          {active.at ? (
            <span className="dna-git-tip__when">{formatWhen(active.at)}</span>
          ) : null}
          {active.refs.length > 0 ? (
            <span className="dna-git-tip__refs">
              {active.refs
                .map((ref) => gitRefBranch(ref) ?? ref)
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
