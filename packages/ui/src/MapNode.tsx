import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactElement } from "react";
import { resolveFileType } from "./file-type.js";
import { isPathKind, splitRepoPath } from "./map-path.js";
import { MaterialFileIcon } from "./MaterialFileIcon.js";

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
  /** Active heat layer id for tinting (M-019). */
  heatLayer?: string;
  /** Discrete heat band 0–3. */
  heatBand?: string;
  /** Feature detection confidence 0–1 (drives the card meter). */
  confidence?: number;
  /** Staggered entrance delay in seconds. */
  enterDelay?: number;
  /** Number of graph relationships (drives the links chip). */
  links?: number;
};

function ConfidenceMeter(props: { value: number }): ReactElement {
  const pct = Math.max(0, Math.min(100, Math.round(props.value * 100)));
  const band =
    props.value >= 0.7 ? "high" : props.value >= 0.45 ? "mid" : "low";
  return (
    <span
      className="prism-meter"
      role="img"
      aria-label={`confidence ${pct}%`}
      title={`${pct}% confidence`}
    >
      <span className="prism-meter__track">
        <span
          className="prism-meter__fill"
          data-band={band}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="prism-meter__val">{pct}%</span>
    </span>
  );
}

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
  const reduce = useReducedMotion();
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
      data-heat-layer={data.heatLayer ?? ""}
      data-heat-band={data.heatBand ?? ""}
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

      <span className="prism-node__blast" aria-hidden />

      {parts && fileType ? (
        <article className="prism-card prism-card--file">
          <MaterialFileIcon name={parts.name} size={26} />
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
        <motion.article
          className="prism-card prism-card--region"
          initial={reduce ? false : { opacity: 0, y: 10, scale: 0.965 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.44,
            ease: [0.16, 1, 0.3, 1],
            delay: data.enterDelay ?? 0,
          }}
        >
          <span className="prism-card__aura" aria-hidden />
          <span className="prism-card__accent" aria-hidden />
          <header className="prism-card__head">
            <span className="prism-card__glyph">
              {isFolder ? (
                <MaterialFileIcon
                  name={data.fullLabel ?? data.label}
                  folder
                  open={data.expanded ?? false}
                  size={22}
                />
              ) : (
                <RegionIcon kind={data.kind} />
              )}
            </span>
            <span className="prism-card__kicker">
              {isFolder ? "folder" : data.kind}
            </span>
            {data.links && data.links > 0 ? (
              <span
                className="prism-card__chip"
                title={`${data.links} ${data.links === 1 ? "link" : "links"}`}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                  <path
                    d="M4.6 7.4 7.4 4.6M5 2.6l.7-.7a2.1 2.1 0 0 1 3 3l-.7.7M7 9.4l-.7.7a2.1 2.1 0 0 1-3-3l.7-.7"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                {data.links}
              </span>
            ) : null}
          </header>
          <div className="prism-card__title">{data.label}</div>
          <footer className="prism-card__foot">
            {typeof data.confidence === "number" ? (
              <ConfidenceMeter value={data.confidence} />
            ) : null}
            <span className="prism-card__meta">
              {data.meta ??
                (data.openable
                  ? data.expanded
                    ? "Expanded"
                    : "Double-click to expand"
                  : "Region")}
            </span>
          </footer>
          {data.openable ? (
            <span className="prism-card__open" aria-hidden>
              <svg width="13" height="13" viewBox="0 0 14 14">
                <path
                  d="M4.5 9.5 9.5 4.5M9.5 4.5H5.3M9.5 4.5v4.2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </span>
          ) : null}
        </motion.article>
      )}
    </div>
  );
}
