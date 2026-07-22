import type { MapZoomLevel } from "@prism/shared";
import * as Tooltip from "@radix-ui/react-tooltip";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, type ReactElement } from "react";
import {
  Boxes,
  Braces,
  File as FileIcon,
  Hexagon,
  Package,
  type LucideIcon,
} from "lucide-react";

type LevelMeta = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly hint: string;
};

const LEVEL_META: Record<MapZoomLevel, LevelMeta> = {
  repo: { icon: Boxes, label: "Repo", hint: "The whole repository" },
  package: { icon: Package, label: "Package", hint: "Workspaces & packages" },
  feature: { icon: Hexagon, label: "Feature", hint: "Feature regions" },
  file: { icon: FileIcon, label: "File", hint: "Files & folders" },
  symbol: { icon: Braces, label: "Symbol", hint: "Functions & symbols" },
};

export type ZoomRailProps = {
  readonly levels: readonly MapZoomLevel[];
  readonly active: MapZoomLevel;
  readonly onChange: (level: MapZoomLevel) => void;
  readonly counts?: Partial<Record<MapZoomLevel, number>>;
};

/**
 * Resolve a keyboard shortcut to a target zoom level (or null if none).
 * `[`/ArrowLeft = climb, `]`/ArrowRight = descend, `1`-`9` = jump.
 */
export function zoomKeyTarget(
  levels: readonly MapZoomLevel[],
  active: MapZoomLevel,
  key: string,
): MapZoomLevel | null {
  const index = levels.indexOf(active);
  if (key === "[" || key === "ArrowLeft") {
    return index > 0 ? levels[index - 1]! : null;
  }
  if (key === "]" || key === "ArrowRight") {
    return index < levels.length - 1 ? levels[index + 1]! : null;
  }
  if (/^[1-9]$/.test(key)) {
    return levels[Number(key) - 1] ?? null;
  }
  return null;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function ZoomRail(props: ZoomRailProps): ReactElement {
  const reduce = useReducedMotion();
  const { levels, active, onChange } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      const target = zoomKeyTarget(levels, active, e.key);
      if (target && target !== active) {
        e.preventDefault();
        onChange(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [levels, active, onChange]);

  return (
    <Tooltip.Provider delayDuration={280} skipDelayDuration={120}>
      <div
        className="prism-rail"
        role="tablist"
        aria-label="Map altitude"
        aria-orientation="horizontal"
      >
        {levels.map((level, index) => {
          const meta = LEVEL_META[level];
          const Icon = meta.icon;
          const on = level === active;
          const count = props.counts?.[level];
          return (
            <Tooltip.Root key={level}>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-active={on ? "true" : "false"}
                  className="prism-rail__seg"
                  onClick={() => onChange(level)}
                >
                  {on ? (
                    <motion.span
                      layoutId="prism-rail-active"
                      className="prism-rail__glow"
                      transition={
                        reduce
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 520, damping: 40 }
                      }
                    />
                  ) : null}
                  <Icon
                    className="prism-rail__icon"
                    size={15}
                    strokeWidth={2}
                  />
                  <span className="prism-rail__label">{meta.label}</span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="prism-tip"
                  side="top"
                  sideOffset={10}
                >
                  <span className="prism-tip__title">{meta.label}</span>
                  <span className="prism-tip__hint">
                    {meta.hint}
                    {typeof count === "number" ? ` · ${count}` : ""}
                  </span>
                  <span className="prism-tip__key">{index + 1}</span>
                  <Tooltip.Arrow className="prism-tip__arrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </div>
    </Tooltip.Provider>
  );
}
