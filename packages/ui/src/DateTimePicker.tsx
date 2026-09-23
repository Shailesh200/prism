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
import { Button } from "./Button.js";
import {
  calendarWeeks,
  clampDatetime,
  combineDateAndTime,
  datetimePickerError,
  datetimePopOpensAbove,
  startOfLocalDay,
  formatDatetimeField,
  parseDatetimeInput,
  shiftMonth,
  visibleDatetimeError,
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
  const weekStart = weekStartsOn(locale);
  const autoId = useId();
  const id = props.id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const [above, setAbove] = useState(false);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftMs, setDraftMs] = useState<number | undefined>(undefined);
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
  const shownError = visibleDatetimeError(dirty, error);
  const selectedMs = parsed ?? valueMs;
  const previewMs = open && draftMs !== undefined ? draftMs : selectedMs;
  const selected = previewMs !== undefined ? new Date(previewMs) : new Date();
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
    setDirty(false);
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
    if (!open) {
      setDraftMs(undefined);
      return;
    }
    setDraftMs(valueMs ?? Date.now());
  }, [open, valueMs]);

  useLayoutEffect(() => {
    if (!open) {
      setAbove(false);
      return;
    }
    const place = (): void => {
      const control = controlRef.current;
      const pop = popRef.current;
      if (!control || !pop) return;
      const rect = control.getBoundingClientRect();
      const gap = 6;
      const margin = 8;
      const vh = window.innerHeight;
      const spaceBelow = vh - margin - (rect.bottom + gap);
      const spaceAbove = rect.top - gap - margin;
      setAbove(datetimePopOpensAbove(spaceBelow, spaceAbove, pop.offsetHeight));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

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
  const preview = (ms: number): void => {
    const next = clampDatetime(ms, bounds);
    setDraftMs(next);
    setText(formatDatetimeField(next, locale));
    setDirty(true);
  };
  const applyDraft = (): void => {
    if (draftMs !== undefined) commit(draftMs);
    setOpen(false);
  };
  const hours = selected.getHours();
  const minutes = selected.getMinutes();
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
    preview(combineDateAndTime(previewMs ?? Date.now(), hour, minutes, bounds));
  };
  const setMinute = (minute: number): void => {
    preview(combineDateAndTime(previewMs ?? Date.now(), hours, minute, bounds));
  };

  const controlClass = [
    "prism-dt__control",
    open ? "prism-dt__control--open" : "",
    shownError ? "prism-dt__control--error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const field = (
    <div className="prism-dt" ref={rootRef}>
      <div className={controlClass} ref={controlRef}>
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
          aria-invalid={shownError !== undefined}
          aria-describedby={shownError ? `${id}-hint` : undefined}
          onFocus={() => {
            focusedRef.current = true;
          }}
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
            setDirty(true);
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
      {shownError ? (
        <span
          className="prism-field__hint prism-field__hint--error"
          id={`${id}-hint`}
        >
          {shownError}
        </span>
      ) : null}
      {open ? (
        <div
          ref={popRef}
          className={
            above ? "prism-dt__pop prism-dt__pop--above" : "prism-dt__pop"
          }
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
                previewMs !== undefined &&
                cell.startMs === startOfLocalDay(previewMs);
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
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => {
                    preview(
                      combineDateAndTime(cell.startMs, hours, minutes, bounds),
                    );
                    setView({ year: cell.year, month: cell.month });
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="prism-dt__time">
            <span className="prism-dt__time-copy">
              <span className="prism-dt__time-label">Time</span>
              <span className="prism-dt__time-sub">24h format</span>
            </span>
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
                value={padClock(hours)}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (!Number.isFinite(n) || n < 0 || n > 23) return;
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
          </div>
          <div className="prism-dt__actions">
            <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={applyDraft}>
              Select
            </Button>
          </div>
        </div>
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
