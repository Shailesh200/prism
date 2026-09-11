import {
  useState,
  type ReactElement,
  type ReactNode,
  type ToggleEvent,
} from "react";

export type AccordionProps = {
  readonly summary: ReactNode;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
};

export function Accordion(props: AccordionProps): ReactElement {
  const classes = ["prism-accordion", props.className]
    .filter(Boolean)
    .join(" ");
  const [open, setOpen] = useState(Boolean(props.defaultOpen));
  return (
    <details
      className={classes}
      open={open}
      onToggle={(event: ToggleEvent<HTMLDetailsElement>) =>
        setOpen(event.currentTarget.open)
      }
    >
      <summary className="prism-accordion__summary">
        <svg
          className="prism-accordion__chevron"
          viewBox="0 0 20 20"
          width={14}
          height={14}
          aria-hidden
        >
          <path fill="currentColor" d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className="prism-accordion__summary-body">{props.summary}</span>
      </summary>
      <div className="prism-accordion__body">{props.children}</div>
    </details>
  );
}
