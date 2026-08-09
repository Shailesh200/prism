import { Info } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type TooltipAlign = "start" | "center" | "end";

export type TooltipProps = {
  readonly label: string;
  readonly children: ReactNode;
  /** Horizontal alignment of the popover relative to the trigger. */
  readonly align?: TooltipAlign;
  /**
   * Optional interactive footer (e.g. action button). When set, the popover
   * stays open while the pointer is over the popover so the action is clickable.
   */
  readonly actions?: ReactNode;
};

/** Margin kept between the popover and the viewport edges. */
const VIEWPORT_MARGIN = 8;
/** Gap between the trigger and the popover. */
const GAP = 8;
/** Grace period before closing when leaving trigger toward the popover. */
const CLOSE_DELAY_MS = 180;

type Position = { readonly top: number; readonly left: number };

/**
 * Small accessible "how is this calculated" affordance.
 * Shows a popover on hover, focus, or click; explains the underlying formula.
 *
 * The popover renders into a `document.body` portal with `position: fixed` and
 * a viewport-aware top/left, so it never clips behind the header/sidebar or
 * runs off-screen near a window edge.
 */
export function Tooltip(props: TooltipProps): ReactElement {
  const { label, children, align = "center", actions } = props;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mouse clicks fire focus before click; without this flag onFocus would open
  // the popover and the following click would immediately toggle it closed.
  const pointerFocus = useRef(false);
  const interactive = actions != null;

  const clearCloseTimer = useCallback((): void => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback((): void => {
    clearCloseTimer();
    if (!interactive) {
      setOpen(false);
      return;
    }
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearCloseTimer, interactive]);

  const openNow = useCallback((): void => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  const compute = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popW = popRef.current?.offsetWidth ?? 240;
    const popH = popRef.current?.offsetHeight ?? 0;

    let left: number;
    if (align === "start") left = rect.left;
    else if (align === "end") left = rect.right - popW;
    else left = rect.left + rect.width / 2 - popW / 2;
    left = Math.min(
      Math.max(left, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, vw - popW - VIEWPORT_MARGIN),
    );

    let top = rect.bottom + GAP;
    const flipsOffBottom = top + popH > vh - VIEWPORT_MARGIN;
    const fitsAbove = rect.top - GAP - popH >= VIEWPORT_MARGIN;
    if (popH > 0 && flipsOffBottom && fitsAbove) {
      top = rect.top - GAP - popH;
    }
    top = Math.min(
      Math.max(top, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, vh - popH - VIEWPORT_MARGIN),
    );

    setPos({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    compute();
  }, [open, compute, actions]);

  useEffect(() => {
    if (!open) return;
    const handler = (): void => compute();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, compute]);

  const style: CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    : { top: -9999, left: -9999 };

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={popRef}
            id={id}
            role="tooltip"
            className="prism-tooltip__pop"
            data-open={pos ? "true" : "false"}
            data-interactive={interactive ? "true" : undefined}
            style={style}
            onMouseEnter={interactive ? openNow : undefined}
            onMouseLeave={interactive ? scheduleClose : undefined}
          >
            <span className="prism-tooltip__title">{label}</span>
            <span className="prism-tooltip__body">{children}</span>
            {actions ? (
              <span className="prism-tooltip__actions">{actions}</span>
            ) : null}
          </span>,
          document.body,
        )
      : null;

  return (
    <span className="prism-tooltip">
      {/* span + role=button: InfoTips live inside accordion triggers and KPI
          cards, where a native <button> would be invalid nested interactive
          content. stopPropagation keeps the tip from toggling its parent. */}
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        className="prism-tooltip__trigger"
        aria-label={`How ${label} is calculated`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onMouseDown={() => {
          pointerFocus.current = true;
        }}
        onFocus={() => {
          if (pointerFocus.current) return;
          openNow();
        }}
        onBlur={() => {
          pointerFocus.current = false;
          scheduleClose();
        }}
        onClick={(e) => {
          e.stopPropagation();
          pointerFocus.current = false;
          clearCloseTimer();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            clearCloseTimer();
            setOpen((v) => !v);
          }
        }}
      >
        <Info size={12} aria-hidden />
      </span>
      {popover}
    </span>
  );
}

export { Tooltip as InfoTip };
