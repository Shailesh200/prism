import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Pip, ProgressBar } from "@repo-prism/ui";

export const PRISM_BOOT_INDEX_STAGES = [
  "Reading the tree",
  "Mapping packages",
  "Building the graph",
  "Charting the map",
] as const;

export const PRISM_BOOT_LOOKUP_STAGES = [
  "Finding repositories",
  "Resolving the workspace",
] as const;

const LIT_CELLS = new Set([2, 3, 8, 9, 10, 11, 15, 16, 17]);

export type PrismBootScreenProps = {
  readonly brand?: string;
  readonly markSrc?: string;
  readonly title: string;
  readonly hint?: string;
  readonly detail?: string;
  readonly stages?: readonly string[];
  readonly children?: ReactNode;
};

export function PrismBootScreen(props: PrismBootScreenProps): ReactElement {
  const stages = props.stages ?? PRISM_BOOT_INDEX_STAGES;
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (stages.length <= 1) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    if (reduceMotion?.matches) return;
    const id = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % stages.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [stages]);

  const stage = stages[Math.min(stageIndex, stages.length - 1)] ?? stages[0];

  return (
    <div className="prism-boot prism-theme">
      <div className="prism-boot__mark">
        <img
          src={props.markSrc ?? "/brand/prism-mark.png"}
          alt=""
          width={36}
          height={36}
        />
        <Pip tone="brand" size="sm" pulse className="prism-boot__pip" />
      </div>
      <p className="prism-boot__brand">{props.brand ?? "Prism"}</p>
      <p className="prism-boot__msg">{props.title}</p>
      <p className="prism-boot__hint">
        {props.hint ?? "Local index · stays on this machine"}
      </p>
      <ProgressBar className="prism-boot__meter" label={props.title} />
      {stage ? (
        <p className="prism-boot__stage" aria-live="polite">
          {stage}
        </p>
      ) : null}
      <MapBootSkeleton />
      {props.detail ? (
        <p className="prism-boot__detail">{props.detail}</p>
      ) : null}
      {props.children}
    </div>
  );
}

function MapBootSkeleton(): ReactElement {
  return (
    <div
      className="prism-boot__map"
      role="status"
      aria-busy="true"
      aria-label="Building the map"
    >
      <div className="prism-boot__map-grid">
        {Array.from({ length: 21 }, (_, index) => (
          <span
            key={index}
            className="prism-boot__cell"
            data-lit={LIT_CELLS.has(index) ? "true" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
