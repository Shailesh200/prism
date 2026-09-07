import { useEffect, useState, type ReactElement } from "react";
import { Button } from "./Button.js";
import {
  CUSTOM_RANGE_PRESET,
  formatRangeAbs,
  fromDatetimeLocalValue,
  presetLabel,
  toDatetimeLocalValue,
  type DateRangePreset,
  type DateRangeValue,
  type DateRangeWindow,
} from "./date-range.js";
import { Input } from "./Input.js";
import { Popover } from "./Popover.js";

export type DateRangePickerProps = {
  readonly presets: readonly DateRangePreset[];
  readonly value: DateRangeValue;
  readonly onChange: (next: DateRangeValue) => void;
  /** Resolve a preset id into an absolute window (All is unbounded). */
  readonly presetWindow: (presetId: string, nowMs: number) => DateRangeWindow;
  readonly nowMs?: number;
  readonly "aria-label"?: string;
  readonly className?: string;
};

/**
 * Grafana-style range: absolute from/to on the left of the trigger and in the
 * dropdown, preset list on the right.
 */
export function DateRangePicker(props: DateRangePickerProps): ReactElement {
  const nowMs = props.nowMs ?? Date.now();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() =>
    toDatetimeLocalValue(props.value.startMs),
  );
  const [to, setTo] = useState(() => toDatetimeLocalValue(props.value.endMs));

  useEffect(() => {
    if (!open) return;
    setFrom(toDatetimeLocalValue(props.value.startMs));
    setTo(toDatetimeLocalValue(props.value.endMs || nowMs));
  }, [open, props.value.startMs, props.value.endMs, nowMs]);

  const applyCustom = (): void => {
    const startMs = fromDatetimeLocalValue(from);
    const endMs = fromDatetimeLocalValue(to);
    if (startMs === undefined || endMs === undefined || startMs >= endMs) {
      return;
    }
    props.onChange({ preset: CUSTOM_RANGE_PRESET, startMs, endMs });
    setOpen(false);
  };

  const triggerClass = props.className
    ? `prism-range-trigger ${props.className}`
    : "prism-range-trigger";

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      contentClassName="prism-range-pop"
      trigger={
        <Button
          variant="secondary"
          size="sm"
          className={triggerClass}
          aria-label={props["aria-label"] ?? "Time range"}
          aria-expanded={open}
        >
          <span className="prism-range-trigger__abs">
            {formatRangeAbs(props.value, nowMs)}
          </span>
          <span className="prism-range-trigger__preset">
            {presetLabel(props.presets, props.value.preset)}
          </span>
        </Button>
      }
    >
      <div className="prism-range-pop__abs">
        <Input
          label="From"
          type="datetime-local"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          label="To"
          type="datetime-local"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={applyCustom}
          disabled={
            fromDatetimeLocalValue(from) === undefined ||
            fromDatetimeLocalValue(to) === undefined ||
            (fromDatetimeLocalValue(from) ?? 0) >=
              (fromDatetimeLocalValue(to) ?? 0)
          }
        >
          Apply time range
        </Button>
      </div>
      <div
        className="prism-range-pop__presets"
        role="listbox"
        aria-label="Range presets"
      >
        {props.presets.map((preset) => (
          <Button
            key={preset.id}
            size="sm"
            variant="tertiary"
            role="option"
            aria-pressed={props.value.preset === preset.id}
            onClick={() => {
              const window = props.presetWindow(preset.id, nowMs);
              props.onChange({
                preset: preset.id,
                startMs: window.startMs,
                endMs: window.endMs,
              });
              setOpen(false);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </Popover>
  );
}
