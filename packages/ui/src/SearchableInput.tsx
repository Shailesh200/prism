import { Search } from "lucide-react";
import {
  useEffect,
  useRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactElement,
} from "react";

export type SearchableInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onDebouncedChange?: (value: string) => void;
  readonly debounceMs?: number;
};

export function SearchableInput(props: SearchableInputProps): ReactElement {
  const {
    value,
    onChange,
    onDebouncedChange,
    debounceMs = 200,
    className,
    disabled,
    placeholder = "Search…",
    ...rest
  } = props;

  const onDebouncedChangeRef = useRef(onDebouncedChange);
  onDebouncedChangeRef.current = onDebouncedChange;

  useEffect(() => {
    const callback = onDebouncedChangeRef.current;
    if (!callback) return;
    const timer = setTimeout(() => {
      callback(value);
    }, debounceMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, debounceMs]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value);
  };

  const wrapperClass = className ? `prism-search ${className}` : "prism-search";

  return (
    <div className={wrapperClass} data-disabled={disabled ? "true" : undefined}>
      <span className="prism-search__icon" aria-hidden>
        <Search size={14} strokeWidth={2} />
      </span>
      <input
        type="search"
        className="prism-search__input"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        {...rest}
      />
    </div>
  );
}
