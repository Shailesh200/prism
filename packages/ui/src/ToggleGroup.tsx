import {
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export type ToggleGroupOption = {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
};

export type ToggleGroupProps = {
  readonly options: readonly ToggleGroupOption[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly "aria-label"?: string;
  readonly className?: string;
};

function enabledIds(options: readonly ToggleGroupOption[]): string[] {
  return options
    .filter((option) => !option.disabled)
    .map((option) => option.id);
}

export function ToggleGroup(props: ToggleGroupProps): ReactElement {
  const { options, value, onChange, className } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const groupClass = className
    ? `prism-toggle-group ${className}`
    : "prism-toggle-group";

  const move = (id: string): void => {
    onChange(id);
    requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
        ?.focus();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const ids = enabledIds(options);
    if (ids.length === 0) return;
    const current = ids.includes(value) ? value : ids[0]!;
    const index = ids.indexOf(current);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(ids[(index + 1) % ids.length]!);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(ids[(index - 1 + ids.length) % ids.length]!);
    }
  };

  return (
    <div
      ref={rootRef}
      className={groupClass}
      role="radiogroup"
      aria-label={props["aria-label"]}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            className="prism-toggle-group__btn"
            data-active={active ? "true" : "false"}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={option.disabled}
            onClick={() => {
              if (!option.disabled) onChange(option.id);
            }}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
