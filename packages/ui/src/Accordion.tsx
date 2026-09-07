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
      <summary className="prism-accordion__summary">{props.summary}</summary>
      <div className="prism-accordion__body">{props.children}</div>
    </details>
  );
}
