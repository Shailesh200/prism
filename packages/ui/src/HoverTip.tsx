import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { hugTooltipPopWidth } from "./tooltip-layout.js";

export type HoverTipProps = {
  /** Short heading, or the sole tip text when `detail` is omitted. */
  readonly label: string;
  /**
   * Optional body under `label`. Long copy is clamped in CSS — never dump a
   * full brief/PRD into the popover.
   */
  readonly detail?: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** Extra class on the portaled popover (chart tiles, etc.). */
  readonly popClassName?: string;
  /** Skip the 4-line clamp — Envelope chart hovers are a short fact list. */
  readonly unclamp?: boolean;
};

const VIEWPORT_MARGIN = 8;
const GAP = 8;

/** Hover/focus label over a clipped control — not the InfoTip affordance. */
export function HoverTip(props: HoverTipProps): ReactElement {
  const { label, detail, children, className, popClassName, unclamp } = props;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: -9999,
    left: -9999,
  });

  const place = useCallback((): void => {
    const trigger = triggerRef.current;
    const pop = popRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (pop) hugTooltipPopWidth(pop);
    const popW = pop?.offsetWidth ?? 0;
    const popH = pop?.offsetHeight ?? 0;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - popW - VIEWPORT_MARGIN),
    );
    let top = rect.bottom + GAP;
    if (popH > 0 && top + popH > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, rect.top - GAP - popH);
    }
    setStyle({ position: "fixed", top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, label, detail]);

  useEffect(() => {
    if (!open) return;
    const sync = (): void => place();
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    const viewport = window.visualViewport;
    viewport?.addEventListener("scroll", sync);
    viewport?.addEventListener("resize", sync);
    const frame = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      viewport?.removeEventListener("resize", sync);
    };
  }, [open, place]);

  const hasDetail = Boolean(detail?.trim());
  const body = hasDetail ? detail!.trim() : label;
  const showTitle = hasDetail;
  const clamp = Boolean(hasDetail && !unclamp);

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={popRef}
            role="tooltip"
            className={[
              "prism-tooltip__pop",
              "prism-tooltip__pop--hover",
              popClassName,
            ]
              .filter(Boolean)
              .join(" ")}
            data-open="true"
            style={style}
          >
            {showTitle ? (
              <span className="prism-tooltip__title">{label}</span>
            ) : null}
            <span
              className={
                clamp
                  ? "prism-tooltip__body prism-tooltip__body--clamp"
                  : "prism-tooltip__body"
              }
            >
              {body}
            </span>
          </span>,
          document.body,
        )
      : null;

  const classes = ["prism-hovertip", className].filter(Boolean).join(" ");
  return (
    <span
      ref={triggerRef}
      className={classes}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {popover}
    </span>
  );
}
