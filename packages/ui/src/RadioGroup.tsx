import { useId, type ReactElement, type ReactNode } from "react";

export type RadioOption = {
  readonly value: string;
  readonly label: ReactNode;
  readonly hint?: string;
};

export type RadioGroupProps = {
  readonly name: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly RadioOption[];
  readonly legend?: string;
  readonly disabled?: boolean;
};

export function selectedRadioHint(
  options: readonly RadioOption[],
  value: string,
): string | undefined {
  const hint = options.find((option) => option.value === value)?.hint;
  return typeof hint === "string" && hint.trim() !== "" ? hint : undefined;
}

export function RadioGroup(props: RadioGroupProps): ReactElement {
  const hintId = useId();
  const hint = selectedRadioHint(props.options, props.value);
  return (
    <fieldset
      className="prism-field prism-radios"
      disabled={props.disabled}
      aria-describedby={hint ? hintId : undefined}
    >
      {props.legend ? (
        <legend className="prism-field__label">{props.legend}</legend>
      ) : null}
      <div className="prism-radios__row">
        {props.options.map((option) => (
          <label key={option.value} className="prism-radio">
            <input
              type="radio"
              className="prism-radio__input"
              name={props.name}
              value={option.value}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            <span className="prism-radio__dot" aria-hidden />
            <span className="prism-radio__label">{option.label}</span>
          </label>
        ))}
      </div>
      {hint ? (
        <span id={hintId} className="prism-field__hint" role="status">
          {hint}
        </span>
      ) : null}
    </fieldset>
  );
}
