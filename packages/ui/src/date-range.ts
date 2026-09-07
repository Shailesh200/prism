import { formatPrismDate } from "./format-prism-date.js";

export const CUSTOM_RANGE_PRESET = "custom";

export type DateRangePreset = {
  readonly id: string;
  readonly label: string;
  readonly shortLabel?: string;
};

export type DateRangeWindow = {
  readonly startMs: number;
  readonly endMs: number;
};

export type DateRangeValue = DateRangeWindow & {
  readonly preset: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `datetime-local` value in the user's timezone. */
export function toDatetimeLocalValue(ms: number): string {
  if (!Number.isFinite(ms) || ms <= Number.MIN_SAFE_INTEGER / 2) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  const ms = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  ).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

export function formatRangeAbs(
  window: DateRangeWindow,
  nowMs: number = Date.now(),
): string {
  if (!Number.isFinite(window.startMs) || window.startMs < -1e15) {
    return "All time";
  }
  const start = formatPrismDate(
    new Date(window.startMs).toISOString(),
    "datetime",
    nowMs,
  );
  const end = formatPrismDate(
    new Date(window.endMs).toISOString(),
    "datetime",
    nowMs,
  );
  if (!start || !end) return "Custom";
  return `${start} — ${end}`;
}

export function presetLabel(
  presets: readonly DateRangePreset[],
  preset: string,
): string {
  if (preset === CUSTOM_RANGE_PRESET) return "Custom";
  const row = presets.find((item) => item.id === preset);
  return row?.shortLabel ?? row?.label ?? preset;
}
