# Shared UI primitives

Source: `packages/ui/src`. Full implementations used by the Prism Console.

## Button
- Path: `packages/ui/src/Button.tsx`
- Description: Primary/secondary/ghost/danger/warning actions. Sizes sm and md.
- Key props: variant, size, icon, disabled

```tsx
import type {
  ButtonHTMLAttributes,
  ReactElement,
  ReactNode,
  Ref,
} from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "warning";
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
```

## Badge
- Path: `packages/ui/src/Badge.tsx`
- Description: Status pill. Amber = awaiting approval.
- Key props: tone, pulse

```tsx
import type { ReactElement, ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "accent"
  | "emerald"
  | "amber"
  | "rose"
  | "violet";

export type BadgeProps = {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly className?: string;
  /** Live jobs: glow like the in-progress rail node. */
  readonly pulse?: boolean;
};

export function Badge(props: BadgeProps): ReactElement {
  const tone = props.tone ?? "neutral";
  const classes = [
    "prism-badge",
    `prism-badge--${tone}`,
    props.pulse ? "prism-badge--pulse" : "",
    props.className,
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{props.children}</span>;
}
```

## Textarea
- Path: `packages/ui/src/Textarea.tsx`
- Description: Labeled brief field. Hint row for keyboard.
- Key props: label, hint, readOnly

```tsx
import {
  forwardRef,
  type ReactElement,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly label?: string;
  readonly hint?: string;
};

export const Textarea = forwardRef(function Textarea(
  props: TextareaProps,
  ref: Ref<HTMLTextAreaElement>,
): ReactElement {
  const { label, hint, className, id, ...rest } = props;
  const textareaClass = className
    ? `prism-textarea ${className}`
    : "prism-textarea";
  const field = (
    <textarea ref={ref} id={id} className={textareaClass} {...rest} />
  );
  if (!label && !hint) return field;
  return (
    <label className="prism-field" htmlFor={id}>
      {label ? <span className="prism-field__label">{label}</span> : null}
      {field}
      {hint ? <span className="prism-field__hint">{hint}</span> : null}
    </label>
  );
});
```

## Drawer
- Path: `packages/ui/src/Drawer.tsx`
- Description: Right overlay with header, scroll body, optional footer.
- Key props: title, footer, size, onPrimaryAction

```tsx
import { X } from "lucide-react";
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button.js";

export type DrawerSize = "md" | "lg";

export type DrawerProps = {
  readonly title: string;
  readonly onClose: () => void;
  /** Cmd/Ctrl+Enter on the topmost drawer. */
  readonly onPrimaryAction?: () => void;
  readonly children: ReactNode;
  readonly side?: "right" | "left";
  readonly label?: string;
  readonly footer?: ReactNode;
  /** `lg` is 50vw overlay; `md` is a narrow list overlay. */
  readonly size?: DrawerSize;
};

export type KeyChord = {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
};

let drawerDepth = 0;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function isPrimaryActionKey(event: KeyChord): boolean {
  return (
    Boolean(event.metaKey || event.ctrlKey) &&
    event.key === "Enter" &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isDrawerOpen(): boolean {
  return drawerDepth > 0;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true']",
    ),
  );
}

/** Focused controls should keep Enter; list shortcuts must not steal it. */
export function isActivateTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("button, a[href], [role='menuitem'], [role='option']"),
  );
}

export function pageShortcutBlocked(event: {
  readonly defaultPrevented: boolean;
  readonly target: EventTarget | null;
}): boolean {
  return (
    event.defaultPrevented || isDrawerOpen() || isTypingTarget(event.target)
  );
}

export function listCursorDelta(key: string): number {
  if (key === "j" || key === "ArrowDown") return 1;
  if (key === "k" || key === "ArrowUp") return -1;
  return 0;
}

export function focusableElements(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (el) => {
      if (el.closest("[aria-hidden='true']")) return false;
      return el.getClientRects().length > 0;
    },
  );
}

export function trapTabKey(
  event: KeyboardEvent,
  root: HTMLElement | null,
): void {
  if (event.key !== "Tab" || !root) return;
  const items = focusableElements(root);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !root.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (active === last || !root.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

export function Drawer(props: DrawerProps): ReactElement {
  const side = props.side ?? "right";
  const size = props.size ?? "lg";
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(props.onClose);
  const onPrimaryRef = useRef(props.onPrimaryAction);
  onCloseRef.current = props.onClose;
  onPrimaryRef.current = props.onPrimaryAction;
  useEffect(() => {
    drawerDepth += 1;
    const rank = drawerDepth;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const onKey = (event: KeyboardEvent): void => {
      if (rank !== drawerDepth) return;
      if (event.key === "Tab") {
        trapTabKey(event, panelRef.current);
        return;
      }
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (onPrimaryRef.current && isPrimaryActionKey(event)) {
        event.preventDefault();
        onPrimaryRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    const first = bodyRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    first?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      drawerDepth -= 1;
      previous?.focus();
    };
  }, []);

  const node = (
    <>
      <button
        type="button"
        className={`prism-drawer-scrim prism-drawer-scrim--${size}`}
        aria-label="Close"
        onClick={() => onCloseRef.current()}
      />
      <aside
        ref={panelRef}
        className={`prism-drawer prism-drawer--${side} prism-drawer--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.label ?? props.title}
      >
        <header className="prism-drawer__head">
          <h2 className="prism-drawer__title">{props.title}</h2>
          <IconButton label="Close" onClick={() => onCloseRef.current()}>
            <X size={16} aria-hidden />
          </IconButton>
        </header>
        <div ref={bodyRef} className="prism-drawer__body">
          {props.children}
        </div>
        {props.footer ? (
          <footer className="prism-drawer__foot">{props.footer}</footer>
        ) : null}
      </aside>
    </>
  );

  return typeof document === "undefined"
    ? node
    : createPortal(node, document.body);
}
```
