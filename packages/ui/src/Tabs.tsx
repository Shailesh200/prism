import type { ReactElement } from "react";

export type TabsOption = {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
};

export type TabsProps = {
  readonly options: readonly TabsOption[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly "aria-label"?: string;
  readonly className?: string;
};

export function Tabs(props: TabsProps): ReactElement {
  const { options, value, onChange, className } = props;
  const tabsClass = className ? `prism-tabs ${className}` : "prism-tabs";

  return (
    <div className={tabsClass} role="tablist" aria-label={props["aria-label"]}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            className="prism-tabs__btn"
            data-active={active ? "true" : "false"}
            aria-selected={active}
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
