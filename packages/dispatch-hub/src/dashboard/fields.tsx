import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

export type MenuOption = {
  readonly value: string;
  readonly label: string;
};

export function MenuSelect(props: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly MenuOption[];
  readonly onChange: (value: string) => void;
  readonly hint?: string;
}): ReactElement {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected =
    props.options.find((option) => option.value === props.value) ??
    props.options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="prism-menu-field" ref={root}>
      <span className="prism-menu-field__label" id={id}>
        {props.label}
      </span>
      <button
        type="button"
        className={`prism-menu${open ? " prism-menu--open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={id}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? props.value}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <ul className="prism-menu__list" role="listbox">
          {props.options.map((option) => {
            const on = option.value === props.value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`prism-menu__option${on ? " prism-menu__option--on" : ""}`}
                  onClick={() => {
                    props.onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {on ? <Check size={14} aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {props.hint ? (
        <span className="prism-menu-field__hint">{props.hint}</span>
      ) : null}
    </div>
  );
}

export function ToggleCheck(props: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly children: ReactNode;
  readonly hint?: string;
}): ReactElement {
  return (
    <label className="prism-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        className={`prism-toggle__control${props.checked ? " prism-toggle__control--on" : ""}`}
        onClick={() => props.onChange(!props.checked)}
      >
        <span className="prism-toggle__knob" aria-hidden />
      </button>
      <span className="prism-toggle__copy">
        <span className="prism-toggle__label">{props.children}</span>
        {props.hint ? (
          <span className="prism-toggle__hint">{props.hint}</span>
        ) : null}
      </span>
    </label>
  );
}
