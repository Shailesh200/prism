import {
  forwardRef,
  type ReactElement,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly label?: string;
};

export const Textarea = forwardRef(function Textarea(
  props: TextareaProps,
  ref: Ref<HTMLTextAreaElement>,
): ReactElement {
  const { label, className, id, ...rest } = props;
  const textareaClass = className
    ? `prism-textarea ${className}`
    : "prism-textarea";
  const field = (
    <textarea ref={ref} id={id} className={textareaClass} {...rest} />
  );
  if (!label) return field;
  return (
    <label className="prism-field" htmlFor={id}>
      <span className="prism-field__label">{label}</span>
      {field}
    </label>
  );
});
