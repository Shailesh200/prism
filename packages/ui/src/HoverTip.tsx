import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
};

/** Hover/focus label over a clipped control — not the InfoTip affordance. */
export function HoverTip(props: HoverTipProps): ReactElement {
  const { label, detail, children, className } = props;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    top: -9999,
    left: -9999,
  });

  const place = useCallback((): void => {
    const trigger = triggerRef.current;
    const pop = popRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popW = pop?.offsetWidth ?? 240;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - popW - 8),
    );
    let top = rect.bottom + 8;
    const popH = pop?.offsetHeight ?? 0;
    if (top + popH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - 8 - popH);
    }
    setStyle({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, label, detail]);

  const hasDetail = Boolean(detail?.trim());
  const body = hasDetail ? detail!.trim() : label;
  const showTitle = hasDetail;

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={popRef}
            role="tooltip"
            className="prism-tooltip__pop prism-tooltip__pop--hover"
            data-open="true"
            style={style}
          >
            {showTitle ? (
              <span className="prism-tooltip__title">{label}</span>
            ) : null}
            <span className="prism-tooltip__body prism-tooltip__body--clamp">
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
