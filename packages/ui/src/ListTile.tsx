import type { ButtonHTMLAttributes, ReactElement, ReactNode, Ref } from "react";

export type ListTileProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly selected?: boolean;
  readonly children: ReactNode;
  readonly ref?: Ref<HTMLButtonElement>;
};

/** Full-width selectable surface — repo rows, skill cards, graph nodes. */
export function ListTile(props: ListTileProps): ReactElement {
  const {
    selected,
    className,
    children,
    type = "button",
    ref,
    ...rest
  } = props;
  const classes = ["prism-tile", className].filter(Boolean).join(" ");
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      data-selected={selected ? "true" : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
