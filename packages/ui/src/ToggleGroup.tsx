import type { ReactElement } from "react";

export type ToggleGroupOption = {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
};

export type ToggleGroupProps = {
  readonly options: readonly ToggleGroupOption[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly "aria-label"?: string;
  readonly className?: string;
};

export function ToggleGroup(props: ToggleGroupProps): ReactElement {
  const { options, value, onChange, className } = props;
  const groupClass = className
    ? `prism-toggle-group ${className}`
    : "prism-toggle-group";

  return (
    <div className={groupClass} role="group" aria-label={props["aria-label"]}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className="prism-toggle-group__btn"
            data-active={active ? "true" : "false"}
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => {
              if (!option.disabled) onChange(option.id);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
