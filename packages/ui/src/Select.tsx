import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export type SelectProps = {
  readonly options: readonly SelectOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
  readonly name?: string;
  readonly "aria-label"?: string;
};

/** Page/drawer scroll closes the menu; scrolling the options list must not. */
export function selectClosesOnScroll(
  list: { contains(node: unknown): boolean } | null,
  eventTarget: unknown,
): boolean {
  if (!list || eventTarget == null) return true;
  return !list.contains(eventTarget);
}

export function Select(props: SelectProps): ReactElement {
  const {
    options,
    value,
    onChange,
    label,
    hint,
    disabled,
    className,
    name,
    "aria-label": ariaLabel,
  } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );
  const activeRef = useRef(active);
  activeRef.current = active;
  const selected =
    options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const place = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const listH = listRef.current?.offsetHeight ?? 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flip = spaceBelow < listH + 8 && rect.top > spaceBelow;
      setPos({
        position: "fixed",
        top: flip ? rect.top - listH - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    place();
    const frame = requestAnimationFrame(place);
    const close = (): void => setOpen(false);
    const onPointer = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          const next = current + delta;
          if (options.length === 0) return 0;
          return (next + options.length) % options.length;
        });
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActive(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setActive(Math.max(0, options.length - 1));
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        const option = options[activeRef.current];
        if (!option) return;
        event.preventDefault();
        onChange(option.value);
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onScroll = (event: Event): void => {
      if (!selectClosesOnScroll(listRef.current, event.target)) return;
      close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, options, onChange]);

  const triggerClass = [
    "prism-select",
    open ? "prism-select--open" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const field = (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={triggerClass}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-labelledby={label ? labelId : undefined}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (disabled || open) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="prism-select__value" title={selected?.label ?? value}>
          {selected?.label ?? value}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              className="prism-select__list"
              role="listbox"
              style={pos}
              onWheel={(event) => event.stopPropagation()}
            >
              {options.map((option, index) => {
                const on = option.value === value;
                const highlighted = index === active;
                return (
                  <li key={option.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={`prism-select__option${on ? " prism-select__option--on" : ""}${highlighted ? " prism-select__option--active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span>{option.label}</span>
                      {on ? <Check size={14} aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );

  if (!label) return <div className="prism-select-wrap">{field}</div>;
  return (
    <div className="prism-field">
      <span className="prism-field__label" id={labelId}>
        {label}
      </span>
      {field}
      {hint ? <span className="prism-field__hint">{hint}</span> : null}
    </div>
  );
}
