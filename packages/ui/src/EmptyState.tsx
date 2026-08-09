import type { ReactElement, ReactNode } from "react";

export type EmptyStateProps = {
  readonly children: ReactNode;
};

/**
 * Standard muted empty-state copy used across overview-style screens.
 * Maps to the `.ov-empty` presentation class in app-shell CSS.
 */
export function EmptyState(props: EmptyStateProps): ReactElement {
  return <p className="ov-empty">{props.children}</p>;
}
