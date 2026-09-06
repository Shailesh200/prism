import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export type EmptyStateProps = {
  readonly children: ReactNode;
  readonly icon?: LucideIcon;
  readonly title?: string;
  readonly variant?: "inline" | "page";
};

/**
 * Standard muted empty-state copy used across overview-style screens.
 * Maps to the `.ov-empty` presentation class in app-shell CSS.
 */
export function EmptyState(props: EmptyStateProps): ReactElement {
  const Icon = props.icon;
  const page = props.variant === "page";
  if (!Icon && !props.title && !page) {
    return <p className="ov-empty">{props.children}</p>;
  }
  return (
    <div className={page ? "prism-empty prism-empty--page" : "prism-empty"}>
      {Icon ? (
        <span className="prism-empty__icon" aria-hidden>
          <Icon size={page ? 48 : 22} strokeWidth={1.4} />
        </span>
      ) : null}
      {props.title ? (
        <h2 className="prism-empty__title">{props.title}</h2>
      ) : null}
      <p className="ov-empty">{props.children}</p>
    </div>
  );
}
