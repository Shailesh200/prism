import type {
  ButtonHTMLAttributes,
  ReactElement,
  ReactNode,
  Ref,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: ReactNode;
  readonly ref?: Ref<HTMLButtonElement>;
};

export function Button(props: ButtonProps): ReactElement {
  const {
    variant = "secondary",
    size = "md",
    icon,
    className,
    children,
    type = "button",
    ref,
    ...rest
  } = props;
  const classes = [
    "prism-btn",
    `prism-btn--${variant}`,
    `prism-btn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly ref?: Ref<HTMLButtonElement>;
};

export function IconButton(props: IconButtonProps): ReactElement {
  const {
    label,
    variant = "ghost",
    className,
    children,
    type = "button",
    ref,
    ...rest
  } = props;
  const classes = [
    "prism-btn",
    "prism-btn--icon",
    `prism-btn--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
