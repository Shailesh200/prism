import { describe, expect, it } from "vitest";
import {
  calendarWeeks,
  clampDatetime,
  combineDateAndTime,
  dateRangeCanApply,
  datetimePickerError,
  formatDatetimeField,
  from12h,
  localeDateOrder,
  localeUses12h,
  parseDatetimeInput,
  shiftMonth,
  to12h,
  weekStartsOn,
  weekdayLabels,
} from "./datetime-picker.js";

describe("datetime picker locale", () => {
  it("orders day-first locales as DMY", () => {
    expect(localeDateOrder("en-GB")).toBe("DMY");
    expect(localeDateOrder("en-IN")).toBe("DMY");
    expect(localeDateOrder("en-US")).toBe("MDY");
  });

  it("detects 12-hour clocks", () => {
    expect(localeUses12h("en-US")).toBe(true);
    expect(localeUses12h("en-GB")).toBe(false);
  });

  it("starts the US week on Sunday and GB on Monday", () => {
    expect(weekStartsOn("en-US")).toBe(0);
    expect(weekStartsOn("en-GB")).toBe(1);
  });
});

describe("parseDatetimeInput", () => {
  it("parses the instrument field in a day-first locale", () => {
    const ms = parseDatetimeInput("11/09/2026, 01:51 AM", { locale: "en-GB" });
    expect(ms).toBeDefined();
    const d = new Date(ms ?? 0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(1);
    expect(d.getMinutes()).toBe(51);
  });

  it("parses month-first when the locale is MDY", () => {
    const ms = parseDatetimeInput("11/09/2026, 01:51 AM", { locale: "en-US" });
    expect(ms).toBeDefined();
    const d = new Date(ms ?? 0);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(9);
  });

  it("round-trips a formatted field", () => {
    const src = new Date(2026, 8, 11, 1, 51).getTime();
    const text = formatDatetimeField(src, "en-GB");
    const back = parseDatetimeInput(text, { locale: "en-GB" });
    expect(back).toBe(src);
  });

  it("keeps ISO local values locale-agnostic", () => {
    const ms = parseDatetimeInput("2026-09-11T13:05");
    expect(ms).toBe(new Date(2026, 8, 11, 13, 5).getTime());
  });

  it("fills date-only input from a fallback clock", () => {
    const fallback = new Date(2026, 0, 1, 14, 20).getTime();
    const ms = parseDatetimeInput("11/09/2026", {
      locale: "en-GB",
      fallbackMs: fallback,
    });
    const d = new Date(ms ?? 0);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(20);
  });

  it("rejects garbage", () => {
    expect(parseDatetimeInput("nope")).toBeUndefined();
    expect(
      parseDatetimeInput("32/13/2026, 99:99 AM", { locale: "en-GB" }),
    ).toBe(undefined);
  });
});

describe("datetime picker validation", () => {
  const firstJob = new Date(2026, 8, 1, 8, 0).getTime();
  const from = new Date(2026, 8, 11, 1, 51).getTime();
  const to = new Date(2026, 8, 11, 2, 21).getTime();

  it("blocks dates before the first job", () => {
    expect(
      datetimePickerError("01/08/2026, 09:00 AM", firstJob - 60_000, {
        minMs: firstJob,
      }),
    ).toBe("Can't be before the first job.");
  });

  it("blocks an end before the start", () => {
    expect(
      datetimePickerError(
        "11/09/2026, 01:00 AM",
        from - 60_000,
        {
          minMs: from,
        },
        { min: "Can't be before the start." },
      ),
    ).toBe("Can't be before the start.");
  });

  it("refuses apply when the window is inverted or empty", () => {
    expect(dateRangeCanApply(from, to, firstJob)).toBe(true);
    expect(dateRangeCanApply(to, from, firstJob)).toBe(false);
    expect(dateRangeCanApply(undefined, to, firstJob)).toBe(false);
    expect(dateRangeCanApply(firstJob - 1, to, firstJob)).toBe(false);
  });

  it("clamps a calendar pick onto the bound", () => {
    expect(clampDatetime(firstJob - 1, { minMs: firstJob })).toBe(firstJob);
    expect(clampDatetime(to + 1, { maxMs: to })).toBe(to);
  });
});

describe("calendar grid", () => {
  it("disables every cell when the whole month is before min", () => {
    const min = new Date(2026, 8, 11).getTime();
    const weeks = calendarWeeks(2020, 0, { weekStartsOn: 1, minMs: min });
    expect(weeks.flat().every((cell) => cell.disabled)).toBe(true);
  });

  it("keeps six weeks and disables days before min", () => {
    const min = new Date(2026, 8, 11).getTime();
    const weeks = calendarWeeks(2026, 8, { weekStartsOn: 1, minMs: min });
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toHaveLength(7);
    const tenth = weeks.flat().find((cell) => cell.inMonth && cell.day === 10);
    const eleventh = weeks
      .flat()
      .find((cell) => cell.inMonth && cell.day === 11);
    expect(tenth?.disabled).toBe(true);
    expect(eleventh?.disabled).toBe(false);
  });

  it("lists weekdays from the week start", () => {
    expect(weekdayLabels("en-GB", 1)[0]?.startsWith("Mon")).toBe(true);
    expect(weekdayLabels("en-US", 0)[0]?.startsWith("Sun")).toBe(true);
  });

  it("shifts months across years", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2025, 11, 1)).toEqual({ year: 2026, month: 0 });
  });

  it("combines a day with the current clock", () => {
    const day = new Date(2026, 8, 11).getTime();
    const next = combineDateAndTime(day, 2, 21);
    expect(new Date(next).getHours()).toBe(2);
    expect(new Date(next).getMinutes()).toBe(21);
  });

  it("converts 12-hour meridiens", () => {
    expect(to12h(0)).toEqual({ hour: 12, meridiem: "AM" });
    expect(to12h(13)).toEqual({ hour: 1, meridiem: "PM" });
    expect(from12h(12, "AM")).toBe(0);
    expect(from12h(12, "PM")).toBe(12);
  });
});
