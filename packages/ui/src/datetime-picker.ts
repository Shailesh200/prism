/** Locale-aware datetime field helpers for the Prism DateTimePicker. */

export type DateOrder = "DMY" | "MDY" | "YMD";

export type DatetimeBounds = {
  readonly minMs?: number;
  readonly maxMs?: number;
};

export type DatetimeParseOptions = {
  readonly locale?: string;
  readonly fallbackMs?: number;
};

export type CalendarCell = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly startMs: number;
  readonly inMonth: boolean;
  readonly disabled: boolean;
};

const FIELD_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function localeDateOrder(locale?: string): DateOrder {
  const parts = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(2026, 8, 11));
  const keys = parts
    .filter(
      (part) =>
        part.type === "day" || part.type === "month" || part.type === "year",
    )
    .map((part) => part.type)
    .join("");
  if (keys.startsWith("year")) return "YMD";
  if (keys.startsWith("month")) return "MDY";
  return "DMY";
}

export function localeUses12h(locale?: string): boolean {
  const cycle = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
  }).resolvedOptions().hourCycle;
  if (cycle === "h11" || cycle === "h12") return true;
  if (cycle === "h23" || cycle === "h24") return false;
  return /am|pm/i.test(
    new Date(2026, 0, 1, 13).toLocaleTimeString(locale, { hour: "numeric" }),
  );
}

export function weekStartsOn(locale?: string): 0 | 1 {
  try {
    const loc = new Intl.Locale(locale ?? "en-GB");
    const first = (loc as { weekInfo?: { firstDay?: number } }).weekInfo
      ?.firstDay;
    if (first === 1) return 1;
    if (first === 0 || first === 7) return 0;
  } catch {
    /* Intl.Locale.weekInfo is not everywhere */
  }
  const tag = (locale ?? "").toLowerCase();
  if (tag.startsWith("en-us") || tag.startsWith("en-ca")) return 0;
  return 1;
}

export function formatDatetimeField(ms: number, locale?: string): string {
  if (!Number.isFinite(ms) || ms <= Number.MIN_SAFE_INTEGER / 2) return "";
  return new Date(ms).toLocaleString(locale, FIELD_FORMAT);
}

export function to12h(hours24: number): {
  readonly hour: number;
  readonly meridiem: "AM" | "PM";
} {
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hour = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return { hour, meridiem };
}

export function from12h(hour: number, meridiem: "AM" | "PM"): number {
  const wrapped = ((hour % 12) + 12) % 12;
  return meridiem === "PM" ? wrapped + 12 : wrapped;
}

function parseClock(
  hourRaw: number,
  minute: number,
  meridiem: string | undefined,
): { hour: number; minute: number } | undefined {
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return undefined;
  if (meridiem) {
    const ampm = meridiem.replace(/\./g, "").toUpperCase();
    if (ampm !== "AM" && ampm !== "PM") return undefined;
    if (hourRaw < 1 || hourRaw > 12) return undefined;
    return { hour: from12h(hourRaw, ampm), minute };
  }
  if (hourRaw < 0 || hourRaw > 23) return undefined;
  return { hour: hourRaw, minute };
}

function applyFallbackTime(
  year: number,
  monthIndex: number,
  day: number,
  fallbackMs: number | undefined,
): number {
  const d = new Date(year, monthIndex, day);
  if (fallbackMs !== undefined && Number.isFinite(fallbackMs)) {
    const src = new Date(fallbackMs);
    d.setHours(src.getHours(), src.getMinutes(), 0, 0);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

/** Parse a typed datetime. Accepts the locale field, ISO local, and Date.parse. */
export function parseDatetimeInput(
  raw: string,
  options: DatetimeParseOptions = {},
): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (iso[4] !== undefined && iso[5] !== undefined) {
      const clock = parseClock(Number(iso[4]), Number(iso[5]), undefined);
      if (!clock) return undefined;
      const ms = new Date(
        year,
        month - 1,
        day,
        clock.hour,
        clock.minute,
      ).getTime();
      return Number.isFinite(ms) ? ms : undefined;
    }
    return applyFallbackTime(year, month - 1, day, options.fallbackMs);
  }

  const loose =
    /^(\d{1,4})[/.\\-](\d{1,2})[/.\\-](\d{1,4})(?:[,\s]+(\d{1,2}):(\d{2})(?:\s*([AaPp]\.?[Mm]\.?))?)?$/.exec(
      text,
    );
  if (loose) {
    const a = Number(loose[1]);
    const b = Number(loose[2]);
    const c = Number(loose[3]);
    const order = localeDateOrder(options.locale);
    let year: number;
    let month: number;
    let day: number;
    if (order === "YMD" && String(loose[1]).length === 4) {
      year = a;
      month = b;
      day = c;
    } else if (String(loose[3]).length === 4) {
      year = c;
      if (order === "MDY") {
        month = a;
        day = b;
      } else {
        day = a;
        month = b;
      }
    } else {
      return undefined;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    if (loose[4] !== undefined && loose[5] !== undefined) {
      const clock = parseClock(Number(loose[4]), Number(loose[5]), loose[6]);
      if (!clock) return undefined;
      const ms = new Date(
        year,
        month - 1,
        day,
        clock.hour,
        clock.minute,
      ).getTime();
      return Number.isFinite(ms) ? ms : undefined;
    }
    return applyFallbackTime(year, month - 1, day, options.fallbackMs);
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function datetimePickerError(
  raw: string,
  parsed: number | undefined,
  bounds: DatetimeBounds = {},
  messages?: {
    readonly min?: string;
    readonly max?: string;
  },
): string | undefined {
  if (!raw.trim()) return "Enter a date and time.";
  if (parsed === undefined) return "Not a valid date and time.";
  if (
    bounds.minMs !== undefined &&
    Number.isFinite(bounds.minMs) &&
    parsed < bounds.minMs
  ) {
    return messages?.min ?? "Can't be before the first job.";
  }
  if (
    bounds.maxMs !== undefined &&
    Number.isFinite(bounds.maxMs) &&
    parsed > bounds.maxMs
  ) {
    return messages?.max ?? "Can't be after the end.";
  }
  return undefined;
}

export function clampDatetime(ms: number, bounds: DatetimeBounds = {}): number {
  let next = ms;
  if (bounds.minMs !== undefined && Number.isFinite(bounds.minMs)) {
    next = Math.max(next, bounds.minMs);
  }
  if (bounds.maxMs !== undefined && Number.isFinite(bounds.maxMs)) {
    next = Math.min(next, bounds.maxMs);
  }
  return next;
}

export function weekdayLabels(
  locale: string | undefined,
  start: 0 | 1,
): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const sunday = new Date(2026, 0, 4);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + ((start + i) % 7));
    return fmt.format(day);
  });
}

export function calendarWeeks(
  year: number,
  month: number,
  options: DatetimeBounds & { readonly weekStartsOn?: 0 | 1 } = {},
): CalendarCell[][] {
  const startWeek = options.weekStartsOn ?? 1;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - startWeek + 7) % 7;
  const cursor = new Date(year, month, 1 - offset);
  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const week: CalendarCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const cell = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
      const startMs = startOfLocalDay(cell.getTime());
      const disabled =
        (options.minMs !== undefined &&
          Number.isFinite(options.minMs) &&
          endOfLocalDay(startMs) < options.minMs) ||
        (options.maxMs !== undefined &&
          Number.isFinite(options.maxMs) &&
          startMs > options.maxMs);
      week.push({
        year: cell.getFullYear(),
        month: cell.getMonth(),
        day: cell.getDate(),
        startMs,
        inMonth: cell.getMonth() === month,
        disabled,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

export function combineDateAndTime(
  dayMs: number,
  hours: number,
  minutes: number,
  bounds: DatetimeBounds = {},
): number {
  const d = new Date(startOfLocalDay(dayMs));
  d.setHours(hours, minutes, 0, 0);
  return clampDatetime(d.getTime(), bounds);
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { readonly year: number; readonly month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function dateRangeCanApply(
  fromMs: number | undefined,
  toMs: number | undefined,
  minMs?: number,
): boolean {
  if (fromMs === undefined || toMs === undefined) return false;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return false;
  if (fromMs >= toMs) return false;
  if (minMs !== undefined && Number.isFinite(minMs) && fromMs < minMs) {
    return false;
  }
  if (minMs !== undefined && Number.isFinite(minMs) && toMs < minMs) {
    return false;
  }
  return true;
}
