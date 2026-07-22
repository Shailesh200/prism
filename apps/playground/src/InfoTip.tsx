import { Info } from "lucide-react";
import { useId, useState, type ReactElement, type ReactNode } from "react";

/**
 * Small accessible "how is this calculated" affordance for KPI/region cards.
 * Shows a popover on hover, focus, or click; explains the underlying formula.
 */
export function InfoTip(props: {
  label: string;
  children: ReactNode;
}): ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="ov-info">
      <button
        type="button"
        className="ov-info__btn"
        aria-label={`How ${props.label} is calculated`}
        aria-expanded={open}
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        <Info size={12} aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className="ov-info__pop"
        data-open={open ? "true" : "false"}
      >
        <span className="ov-info__title">{props.label}</span>
        <span className="ov-info__body">{props.children}</span>
      </span>
    </span>
  );
}
