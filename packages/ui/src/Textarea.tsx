import {
  forwardRef,
  type ReactElement,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly label?: string;
  readonly hint?: string;
};

export const Textarea = forwardRef(function Textarea(
  props: TextareaProps,
  ref: Ref<HTMLTextAreaElement>,
): ReactElement {
  const { label, hint, className, id, ...rest } = props;
  const textareaClass = className
    ? `prism-textarea ${className}`
    : "prism-textarea";
  const field = (
    <textarea ref={ref} id={id} className={textareaClass} {...rest} />
  );
  if (!label && !hint) return field;
  return (
    <label className="prism-field" htmlFor={id}>
      {label ? <span className="prism-field__label">{label}</span> : null}
      {field}
      {hint ? <span className="prism-field__hint">{hint}</span> : null}
    </label>
  );
});
