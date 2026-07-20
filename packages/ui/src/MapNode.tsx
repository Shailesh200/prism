import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ReactElement } from "react";
import { FileTypeIcon } from "./FileTypeIcon.js";
import { resolveFileType } from "./file-type.js";
import { isPathKind, splitRepoPath } from "./map-path.js";

export type PrismMapNodeData = {
  label: string;
  kind: string;
  selected: boolean;
  meta?: string;
  /** Has children that can expand on double-click. */
  openable?: boolean;
  /** Children currently shown below this card. */
  expanded?: boolean;
  /** Expand / collapse (wired by the map canvas). */
  onToggle?: () => void;
  /** Soft-dim when another node is focused. */
  dimmed?: boolean;
  /** Full label when display label is shortened. */
  fullLabel?: string;
  /** Cluster / island chrome (not a selectable graph node). */
  group?: boolean;
};

function truncateEnd(value: string, max: number): string {
  if (value.length <= max) return value;
  return `…${value.slice(-(max - 1))}`;
}

function RegionIcon(props: { kind: string }): ReactElement {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 18 18",
    fill: "none",
    "aria-hidden": true as const,
    className: "prism-node__region-icon",
  };
  if (props.kind === "folder") {
    return (
      <svg {...common}>
        <path
          d="M2.5 5h4.2l1 1.1H15.5v6.4H2.5V5Z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (props.kind === "package") {
    return (
      <svg {...common}>
        <path
          d="M3.5 5.5 9 2.5l5.5 3v7L9 15.5l-5.5-3v-7Z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
        <path
          d="M3.5 5.5 9 8.5l5.5-3M9 8.5v7"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (props.kind === "repo" || props.kind === "workspace") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.35" />
        <path
          d="M5.5 9h7M9 5.5v7"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect
        x="3"
        y="3"
        width="12"
        height="12"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="M6 7.5h6M6 10.5h4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MapNode(props: NodeProps): ReactElement {
  const data = props.data as PrismMapNodeData;
  const pathLike = isPathKind(data.kind);
  const parts = pathLike ? splitRepoPath(data.label) : null;
  const fileType = parts ? resolveFileType(parts.name) : null;
  const isFolder = data.kind === "folder";
  const title = data.fullLabel ?? data.label;

  if (data.group || data.kind === "group") {
    return (
      <div className="prism-cluster" title={data.label}>
        <div className="prism-cluster__head">
          <span className="prism-cluster__title">{data.label}</span>
          {data.meta ? (
            <span className="prism-cluster__meta">{data.meta}</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="prism-node nopan nodrag"
      data-kind={data.kind}
      data-path={pathLike ? "true" : "false"}
      data-selected={data.selected ? "true" : "false"}
      data-openable={data.openable ? "true" : "false"}
      data-expanded={data.expanded ? "true" : "false"}
      data-dimmed={data.dimmed ? "true" : "false"}
      title={title}
      onDoubleClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        data.onToggle?.();
      }}
    >
      <Handle type="target" position={Position.Top} className="prism-node__h" />
      <Handle
        type="source"
        position={Position.Bottom}
        className="prism-node__h"
      />

      {parts && fileType ? (
        <article className="prism-card prism-card--file">
          <FileTypeIcon tone={fileType.tone} badge={fileType.badge} size={24} />
          <div className="prism-card__body">
            <div className="prism-card__title">{parts.name}</div>
            <div className="prism-card__sub">
              <span className="prism-card__type">{fileType.label}</span>
              {parts.dir ? (
                <span className="prism-card__path">
                  {truncateEnd(parts.dir.replace(/\/$/, ""), 28)}
                </span>
              ) : null}
            </div>
          </div>
        </article>
      ) : (
        <article className="prism-card prism-card--region">
          <header className="prism-card__head">
            <RegionIcon kind={data.kind} />
            <span className="prism-card__kicker">
              {isFolder ? "folder" : data.kind}
            </span>
          </header>
          <div className="prism-card__title">{data.label}</div>
          <div className="prism-card__sub">
            <span className="prism-card__meta">
              {data.meta ??
                (data.openable
                  ? data.expanded
                    ? "Expanded"
                    : "Double-click to expand"
                  : "Region")}
            </span>
          </div>
        </article>
      )}
    </div>
  );
}
