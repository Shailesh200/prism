import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  calendarWeeks,
  clampDatetime,
  combineDateAndTime,
  datetimePickerError,
  formatDatetimeField,
  from12h,
  localeUses12h,
  parseDatetimeInput,
  shiftMonth,
  to12h,
  weekStartsOn,
  weekdayLabels,
} from "./datetime-picker.js";

export type DateTimePickerProps = {
  readonly value: number | undefined;
  readonly onChange: (ms: number) => void;
  readonly onValidityChange?: (ok: boolean) => void;
  readonly label?: string;
  readonly minMs?: number;
  readonly maxMs?: number;
  readonly minMessage?: string;
  readonly maxMessage?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly locale?: string;
  readonly "aria-label"?: string;
};

function finiteTime(ms: number | undefined): number | undefined {
  if (ms === undefined || !Number.isFinite(ms)) return undefined;
  if (ms <= Number.MIN_SAFE_INTEGER / 2) return undefined;
  return ms;
}

function wrap(value: number, min: number, max: number): number {
  if (value < min) return max;
  if (value > max) return min;
  return value;
}

export function DateTimePicker(props: DateTimePickerProps): ReactElement {
  const locale = props.locale;
  const onValidityChange = props.onValidityChange;
  const uses12h = localeUses12h(locale);
  const weekStart = weekStartsOn(locale);
  const autoId = useId();
  const id = props.id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() =>
    finiteTime(props.value) !== undefined
      ? formatDatetimeField(props.value as number, locale)
      : "",
  );
  const valueMs = finiteTime(props.value);
  const parsed = parseDatetimeInput(text, {
    ...(locale ? { locale } : {}),
    ...(valueMs !== undefined ? { fallbackMs: valueMs } : {}),
  });
  const error = datetimePickerError(
    text,
    parsed,
    {
      ...(props.minMs !== undefined ? { minMs: props.minMs } : {}),
      ...(props.maxMs !== undefined ? { maxMs: props.maxMs } : {}),
    },
    {
      ...(props.minMessage ? { min: props.minMessage } : {}),
      ...(props.maxMessage ? { max: props.maxMessage } : {}),
    },
  );
  const selectedMs = parsed ?? valueMs;
  const selected = selectedMs !== undefined ? new Date(selectedMs) : new Date();
  const [view, setView] = useState(() => ({
    year: selected.getFullYear(),
    month: selected.getMonth(),
  }));

  useEffect(() => {
    if (focusedRef.current) return;
    setText(
      finiteTime(props.value) !== undefined
        ? formatDatetimeField(props.value as number, locale)
        : "",
    );
  }, [props.value, locale]);

  useLayoutEffect(() => {
    onValidityChange?.(error === undefined);
  }, [error, onValidityChange]);

  useEffect(() => {
    if (!open || parsed === undefined) return;
    const next = new Date(parsed);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  }, [open, parsed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const bounds = {
    ...(props.minMs !== undefined ? { minMs: props.minMs } : {}),
    ...(props.maxMs !== undefined ? { maxMs: props.maxMs } : {}),
  };
  const commit = (ms: number): void => {
    const next = clampDatetime(ms, bounds);
    props.onChange(next);
    setText(formatDatetimeField(next, locale));
    onValidityChange?.(true);
  };
  const hours = selected.getHours();
  const minutes = selected.getMinutes();
  const clock12 = to12h(hours);
  const weeks = calendarWeeks(view.year, view.month, {
    weekStartsOn: weekStart,
    ...bounds,
  });
  const labels = weekdayLabels(locale, weekStart);
  const monthLabel = new Date(view.year, view.month, 1).toLocaleString(locale, {
    month: "long",
    year: "numeric",
  });
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  const setHour24 = (hour: number): void => {
    commit(combineDateAndTime(selectedMs ?? Date.now(), hour, minutes, bounds));
  };
  const setMinute = (minute: number): void => {
    commit(combineDateAndTime(selectedMs ?? Date.now(), hours, minute, bounds));
  };

  const controlClass = [
    "prism-dt__control",
    open ? "prism-dt__control--open" : "",
    error ? "prism-dt__control--error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const field = (
    <div className="prism-dt" ref={rootRef}>
      <div className={controlClass}>
        <input
          id={id}
          className="prism-input prism-dt__input"
          value={text}
          disabled={props.disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder={formatDatetimeField(Date.now(), locale)}
          aria-label={props["aria-label"]}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={error !== undefined}
          aria-describedby={error ? `${id}-hint` : undefined}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (
              event.key === "ArrowDown" ||
              (event.altKey && event.key === "ArrowDown")
            ) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          onBlur={() => {
            focusedRef.current = false;
            if (parsed !== undefined && error === undefined) {
              setText(formatDatetimeField(parsed, locale));
            }
          }}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const ms = parseDatetimeInput(next, {
              ...(locale ? { locale } : {}),
              ...(valueMs !== undefined ? { fallbackMs: valueMs } : {}),
            });
            const issue = datetimePickerError(next, ms, bounds, {
              ...(props.minMessage ? { min: props.minMessage } : {}),
              ...(props.maxMessage ? { max: props.maxMessage } : {}),
            });
            onValidityChange?.(issue === undefined);
            if (ms !== undefined && issue === undefined) props.onChange(ms);
          }}
        />
        <button
          type="button"
          className="prism-dt__cal"
          disabled={props.disabled}
          aria-label={open ? "Close calendar" : "Open calendar"}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <Calendar size={14} aria-hidden />
        </button>
      </div>
      {open ? (
        <div
          className="prism-dt__pop"
          role="dialog"
          aria-label="Choose date and time"
        >
          <div className="prism-dt__head">
            <button
              type="button"
              className="prism-dt__nav"
              aria-label="Previous year"
              onClick={() => setView(shiftMonth(view.year, view.month, -12))}
            >
              <ChevronsLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="prism-dt__nav"
              aria-label="Previous month"
              onClick={() => setView(shiftMonth(view.year, view.month, -1))}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <p className="prism-dt__month">{monthLabel}</p>
            <button
              type="button"
              className="prism-dt__nav"
              aria-label="Next month"
              onClick={() => setView(shiftMonth(view.year, view.month, 1))}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="prism-dt__nav"
              aria-label="Next year"
              onClick={() => setView(shiftMonth(view.year, view.month, 12))}
            >
              <ChevronsRight size={16} aria-hidden />
            </button>
          </div>
          <div className="prism-dt__week" aria-hidden>
            {labels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="prism-dt__grid">
            {weeks.flat().map((cell) => {
              const selectedDay =
                selectedMs !== undefined &&
                cell.startMs ===
                  new Date(
                    selected.getFullYear(),
                    selected.getMonth(),
                    selected.getDate(),
                  ).getTime();
              const isToday = cell.startMs === todayStart;
              return (
                <button
                  key={`${cell.year}-${cell.month}-${cell.day}`}
                  type="button"
                  className={[
                    "prism-dt__day",
                    cell.inMonth ? "" : "prism-dt__day--muted",
                    selectedDay ? "prism-dt__day--on" : "",
                    isToday ? "prism-dt__day--today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={cell.disabled}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={selectedDay}
                  onClick={() =>
                    commit(
                      combineDateAndTime(cell.startMs, hours, minutes, bounds),
                    )
                  }
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="prism-dt__time">
            <span className="prism-dt__time-label">Time</span>
            <div className="prism-dt__spin">
              <button
                type="button"
                className="prism-dt__nav"
                aria-label="Increase hour"
                onClick={() => setHour24(wrap(hours + 1, 0, 23))}
              >
                <ChevronUp size={14} aria-hidden />
              </button>
              <input
                className="prism-dt__clock"
                inputMode="numeric"
                aria-label="Hour"
                value={uses12h ? padClock(clock12.hour) : padClock(hours)}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (!Number.isFinite(n)) return;
                  if (uses12h) {
                    if (n < 1 || n > 12) return;
                    setHour24(from12h(n, clock12.meridiem));
                    return;
                  }
                  if (n < 0 || n > 23) return;
                  setHour24(n);
                }}
              />
              <button
                type="button"
                className="prism-dt__nav"
                aria-label="Decrease hour"
                onClick={() => setHour24(wrap(hours - 1, 0, 23))}
              >
                <ChevronDown size={14} aria-hidden />
              </button>
            </div>
            <span className="prism-dt__colon" aria-hidden>
              :
            </span>
            <div className="prism-dt__spin">
              <button
                type="button"
                className="prism-dt__nav"
                aria-label="Increase minute"
                onClick={() => setMinute(wrap(minutes + 1, 0, 59))}
              >
                <ChevronUp size={14} aria-hidden />
              </button>
              <input
                className="prism-dt__clock"
                inputMode="numeric"
                aria-label="Minute"
                value={padClock(minutes)}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (!Number.isInteger(n) || n < 0 || n > 59) return;
                  setMinute(n);
                }}
              />
              <button
                type="button"
                className="prism-dt__nav"
                aria-label="Decrease minute"
                onClick={() => setMinute(wrap(minutes - 1, 0, 59))}
              >
                <ChevronDown size={14} aria-hidden />
              </button>
            </div>
            {uses12h ? (
              <div className="prism-dt__ampm">
                <button
                  type="button"
                  className={
                    clock12.meridiem === "AM"
                      ? "prism-dt__meridiem prism-dt__meridiem--on"
                      : "prism-dt__meridiem"
                  }
                  aria-pressed={clock12.meridiem === "AM"}
                  onClick={() => setHour24(from12h(clock12.hour, "AM"))}
                >
                  AM
                </button>
                <button
                  type="button"
                  className={
                    clock12.meridiem === "PM"
                      ? "prism-dt__meridiem prism-dt__meridiem--on"
                      : "prism-dt__meridiem"
                  }
                  aria-pressed={clock12.meridiem === "PM"}
                  onClick={() => setHour24(from12h(clock12.hour, "PM"))}
                >
                  PM
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <span className="prism-field__hint" id={`${id}-hint`}>
          {error}
        </span>
      ) : null}
    </div>
  );

  if (!props.label) return field;
  return (
    <div className="prism-field">
      <label className="prism-field__label" htmlFor={id}>
        {props.label}
      </label>
      {field}
    </div>
  );
}

function padClock(value: number): string {
  return String(value).padStart(2, "0");
}
