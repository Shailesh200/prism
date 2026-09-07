import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactElement,
  type Ref,
} from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  readonly label?: string;
  readonly hint?: string;
};

export const Input = forwardRef(function Input(
  props: InputProps,
  ref: Ref<HTMLInputElement>,
): ReactElement {
  const { label, hint, className, id, ...rest } = props;
  const inputClass = className ? `prism-input ${className}` : "prism-input";
  const field = <input ref={ref} id={id} className={inputClass} {...rest} />;
  if (!label && !hint) return field;
  return (
    <label className="prism-field" htmlFor={id}>
      {label ? <span className="prism-field__label">{label}</span> : null}
      {field}
      {hint ? <span className="prism-field__hint">{hint}</span> : null}
    </label>
  );
});
