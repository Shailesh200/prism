import type { ReactElement, ReactNode } from "react";

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

export function RadioGroup(props: RadioGroupProps): ReactElement {
  return (
    <fieldset className="prism-radios" disabled={props.disabled}>
      {props.legend ? (
        <legend className="prism-field__label">{props.legend}</legend>
      ) : null}
      <div className="prism-radios__row">
        {props.options.map((option) => (
          <label key={option.value} className="prism-radio" title={option.hint}>
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
    </fieldset>
  );
}
