import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactElement,
  type Ref,
} from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  readonly label?: string;
};

export const Input = forwardRef(function Input(
  props: InputProps,
  ref: Ref<HTMLInputElement>,
): ReactElement {
  const { label, className, id, ...rest } = props;
  const inputClass = className ? `prism-input ${className}` : "prism-input";
  const field = <input ref={ref} id={id} className={inputClass} {...rest} />;
  if (!label) return field;
  return (
    <label className="prism-field" htmlFor={id}>
      <span className="prism-field__label">{label}</span>
      {field}
    </label>
  );
});
