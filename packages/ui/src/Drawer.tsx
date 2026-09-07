import { X } from "lucide-react";
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button.js";

export type DrawerSize = "md" | "lg" | "xl";

export type DrawerProps = {
  readonly title: string;
  readonly onClose: () => void;
  /** Cmd/Ctrl+Enter on the topmost drawer. */
  readonly onPrimaryAction?: () => void;
  readonly children: ReactNode;
  readonly side?: "right" | "left";
  readonly label?: string;
  readonly footer?: ReactNode;
  /** `xl` is 75vw Focus; `lg` is 50vw; `md` is a narrow list overlay. */
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
  if (target == null || typeof Element === "undefined") return false;
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true']",
    ),
  );
}

/** Focused controls should keep Enter; list shortcuts must not steal it. */
export function isActivateTarget(target: EventTarget | null): boolean {
  if (target == null || typeof Element === "undefined") return false;
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
