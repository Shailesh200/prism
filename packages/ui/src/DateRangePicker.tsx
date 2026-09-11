import { useEffect, useState, type ReactElement } from "react";
import { Button } from "./Button.js";
import { DateTimePicker } from "./DateTimePicker.js";
import {
  CUSTOM_RANGE_PRESET,
  formatRangeAbs,
  presetLabel,
  type DateRangePreset,
  type DateRangeValue,
  type DateRangeWindow,
} from "./date-range.js";
import { dateRangeCanApply } from "./datetime-picker.js";
import { Popover } from "./Popover.js";

export type DateRangePickerProps = {
  readonly presets: readonly DateRangePreset[];
  readonly value: DateRangeValue;
  readonly onChange: (next: DateRangeValue) => void;
  /** Resolve a preset id into an absolute window (All is unbounded). */
  readonly presetWindow: (presetId: string, nowMs: number) => DateRangeWindow;
  readonly nowMs?: number;
  /** Earliest selectable instant (first job). */
  readonly minMs?: number;
  readonly "aria-label"?: string;
  readonly className?: string;
};

function finiteBound(ms: number | undefined): number | undefined {
  if (ms === undefined || !Number.isFinite(ms)) return undefined;
  if (ms <= Number.MIN_SAFE_INTEGER / 2) return undefined;
  return ms;
}

/**
 * Grafana-style range: absolute from/to on the left of the trigger and in the
 * dropdown, preset list on the right.
 */
export function DateRangePicker(props: DateRangePickerProps): ReactElement {
  const nowMs = props.nowMs ?? Date.now();
  const minMs = finiteBound(props.minMs);
  const [open, setOpen] = useState(false);
  const [fromMs, setFromMs] = useState(() => finiteBound(props.value.startMs));
  const [toMs, setToMs] = useState(
    () => finiteBound(props.value.endMs) ?? nowMs,
  );
  const [fromOk, setFromOk] = useState(true);
  const [toOk, setToOk] = useState(true);

  useEffect(() => {
    if (!open) return;
    setFromMs(finiteBound(props.value.startMs));
    setToMs(finiteBound(props.value.endMs) ?? nowMs);
    setFromOk(true);
    setToOk(true);
  }, [open, props.value.startMs, props.value.endMs, nowMs]);

  const applyCustom = (): void => {
    if (
      !dateRangeCanApply(fromMs, toMs, minMs) ||
      fromMs === undefined ||
      toMs === undefined
    ) {
      return;
    }
    props.onChange({
      preset: CUSTOM_RANGE_PRESET,
      startMs: fromMs,
      endMs: toMs,
    });
    setOpen(false);
  };

  const toMin =
    fromMs !== undefined && minMs !== undefined
      ? Math.max(fromMs, minMs)
      : (fromMs ?? minMs);
  const toMinMessage =
    fromMs !== undefined && (minMs === undefined || fromMs > minMs)
      ? "Can't be before the start."
      : "Can't be before the first job.";

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
        <DateTimePicker
          label="From"
          value={fromMs}
          minMessage="Can't be before the first job."
          maxMessage="Can't be after the end."
          onChange={setFromMs}
          onValidityChange={setFromOk}
          {...(minMs !== undefined ? { minMs } : {})}
          {...(toMs !== undefined ? { maxMs: toMs } : {})}
        />
        <DateTimePicker
          label="To"
          value={toMs}
          minMessage={toMinMessage}
          onChange={setToMs}
          onValidityChange={setToOk}
          {...(toMin !== undefined ? { minMs: toMin } : {})}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={applyCustom}
          disabled={!fromOk || !toOk || !dateRangeCanApply(fromMs, toMs, minMs)}
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
