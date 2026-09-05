import type { ReactElement, ReactNode } from "react";

export type CheckboxProps = {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly children: ReactNode;
  readonly disabled?: boolean;
};

export function Checkbox(props: CheckboxProps): ReactElement {
  return (
    <label
      className={`prism-check${props.disabled ? " prism-check--disabled" : ""}`}
    >
      <input
        type="checkbox"
        className="prism-check__input"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span className="prism-check__box" aria-hidden />
      <span className="prism-check__label">{props.children}</span>
    </label>
  );
}
