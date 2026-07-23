import type { ChangeEvent, ReactElement, SelectHTMLAttributes } from "react";

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export type SelectProps = {
  readonly options: readonly SelectOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
  readonly name?: SelectHTMLAttributes<HTMLSelectElement>["name"];
  readonly "aria-label"?: string;
};

export function Select(props: SelectProps): ReactElement {
  const {
    options,
    value,
    onChange,
    label,
    disabled,
    id,
    className,
    name,
    "aria-label": ariaLabel,
  } = props;
  const selectClass = className ? `prism-select ${className}` : "prism-select";

  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onChange(event.target.value);
  };

  const field = (
    <select
      id={id}
      className={selectClass}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      name={name}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (!label) return field;
  return (
    <label className="prism-field" htmlFor={id}>
      <span className="prism-field__label">{label}</span>
      {field}
    </label>
  );
}
