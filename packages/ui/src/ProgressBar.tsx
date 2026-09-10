import type { ReactElement } from "react";

export type ProgressBarProps = {
  /** 0–1. Omit for an indeterminate activity meter. */
  readonly value?: number;
  readonly label?: string;
  readonly className?: string;
};

export function ProgressBar(props: ProgressBarProps): ReactElement {
  const classes = ["prism-progress", props.className].filter(Boolean).join(" ");
  const indeterminate = props.value === undefined;
  const width = Math.max(0, Math.min(1, props.value ?? 0));
  return (
    <span
      className={classes}
      role="progressbar"
      aria-label={props.label ?? "Progress"}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(width * 100)}
      data-indeterminate={indeterminate ? "true" : undefined}
    >
      <span
        className="prism-progress__fill"
        style={
          indeterminate ? undefined : { width: `${Math.round(width * 100)}%` }
        }
      />
    </span>
  );
}
