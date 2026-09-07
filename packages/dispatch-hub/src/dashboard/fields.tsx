import { Button } from "@repo-prism/ui";
import type { ReactElement, ReactNode } from "react";

export function ToggleCheck(props: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly children: ReactNode;
  readonly hint?: string;
}): ReactElement {
  return (
    <label className="prism-toggle">
      <Button
        type="button"
        role="switch"
        aria-checked={props.checked}
        variant="tertiary"
        className={`prism-toggle__control${props.checked ? " prism-toggle__control--on" : ""}`}
        onClick={() => props.onChange(!props.checked)}
      >
        <span className="prism-toggle__knob" aria-hidden />
      </Button>
      <span className="prism-toggle__copy">
        <span className="prism-toggle__label">{props.children}</span>
        {props.hint ? (
          <span className="prism-toggle__hint">{props.hint}</span>
        ) : null}
      </span>
    </label>
  );
}
