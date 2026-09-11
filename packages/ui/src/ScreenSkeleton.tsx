import type { ReactElement } from "react";

export type ScreenSkeletonProps = {
  readonly label: string;
  readonly rows?: number;
  readonly className?: string;
};

export function ScreenSkeleton(props: ScreenSkeletonProps): ReactElement {
  const rows = Math.max(1, props.rows ?? 4);
  const classes = ["prism-skeleton", props.className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="status" aria-busy="true">
      <p className="prism-skeleton__label">{props.label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="prism-skeleton__card">
          <span className="prism-skeleton__bar prism-skeleton__bar--title" />
          <span className="prism-skeleton__bar prism-skeleton__bar--meter" />
          <span className="prism-skeleton__bar prism-skeleton__bar--meta" />
        </div>
      ))}
    </div>
  );
}
