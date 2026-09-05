import { X } from "lucide-react";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button.js";

export type DrawerSize = "md" | "lg";

export type DrawerProps = {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly side?: "right" | "left";
  readonly label?: string;
  readonly footer?: ReactNode;
  /** `lg` is 50vw overlay; `md` is a narrow list overlay. */
  readonly size?: DrawerSize;
};

let drawerDepth = 0;

export function Drawer(props: DrawerProps): ReactElement {
  const side = props.side ?? "right";
  const size = props.size ?? "lg";
  useEffect(() => {
    drawerDepth += 1;
    const rank = drawerDepth;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (rank !== drawerDepth) return;
      event.preventDefault();
      props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      drawerDepth -= 1;
    };
  }, [props.onClose]);

  const node = (
    <>
      <button
        type="button"
        className={`prism-drawer-scrim prism-drawer-scrim--${size}`}
        aria-label="Close"
        onClick={props.onClose}
      />
      <aside
        className={`prism-drawer prism-drawer--${side} prism-drawer--${size}`}
        aria-label={props.label ?? props.title}
      >
        <header className="prism-drawer__head">
          <h2 className="prism-drawer__title">{props.title}</h2>
          <IconButton label="Close" onClick={props.onClose}>
            <X size={16} aria-hidden />
          </IconButton>
        </header>
        <div className="prism-drawer__body">{props.children}</div>
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
