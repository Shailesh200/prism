import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export type EmptyStateProps = {
  /** Meta copy under the title. */
  readonly children?: ReactNode;
  readonly icon?: LucideIcon;
  /** Defaults to "No data found" when an icon or actions are provided. */
  readonly title?: string;
  readonly actions?: ReactNode;
  readonly variant?: "inline" | "page";
  readonly className?: string;
};

/**
 * Shared empty block: centered title, overrideable meta, optional actions.
 * Maps to `.prism-empty` / `.ov-empty` in the design system.
 */
export function EmptyState(props: EmptyStateProps): ReactElement {
  const page = props.variant === "page";
  const title =
    props.title ??
    (props.icon || props.actions || page ? "No data found" : undefined);
  const Icon = props.icon ?? (title ? Inbox : undefined);
  const classes = [
    page ? "prism-empty prism-empty--page" : "prism-empty",
    props.className,
  ]
    .filter(Boolean)
    .join(" ");
  if (!Icon && !title && !page && !props.actions && !props.className) {
    return <p className="ov-empty">{props.children}</p>;
  }
  return (
    <div className={classes}>
      {Icon ? (
        <span className="prism-empty__icon" aria-hidden>
          <Icon size={page ? 48 : 22} strokeWidth={1.4} />
        </span>
      ) : null}
      {title ? <h2 className="prism-empty__title">{title}</h2> : null}
      {props.children ? <p className="ov-empty">{props.children}</p> : null}
      {props.actions ? (
        <div className="prism-empty__actions">{props.actions}</div>
      ) : null}
    </div>
  );
}
