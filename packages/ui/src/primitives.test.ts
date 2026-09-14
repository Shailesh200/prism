import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  Accordion,
  Badge,
  Button,
  Checkbox,
  Drawer,
  DateRangePicker,
  DateTimePicker,
  isActivateTarget,
  isDrawerOpen,
  isPrimaryActionKey,
  isTypingTarget,
  listCursorDelta,
  pageShortcutBlocked,
  DropdownMenu,
  EmptyState,
  HoverTip,
  MetricCard,
  ListTile,
  Pip,
  Popover,
  ProgressBar,
  IconButton,
  InfoTip,
  Input,
  PACKAGE_NAME,
  RadioGroup,
  SearchableInput,
  Select,
  Table,
  Tabs,
  Textarea,
  ToggleGroup,
  Tooltip,
  Truncate,
  ScreenSkeleton,
  PrismToastHost,
  showPrismToast,
} from "./index.js";

function isComponent(value: unknown): boolean {
  return typeof value === "function" || typeof value === "object";
}

describe("design-system primitives exports", () => {
  it("keeps PACKAGE_NAME and exports primitive components", () => {
    expect(PACKAGE_NAME).toBe("@repo-prism/ui");
    expect(Input).toBeTruthy();
    expect(Textarea).toBeTruthy();
    expect(isComponent(Input)).toBe(true);
    expect(isComponent(Textarea)).toBe(true);
    expect(isComponent(Select)).toBe(true);
    expect(isComponent(SearchableInput)).toBe(true);
    expect(typeof ToggleGroup).toBe("function");
    expect(typeof Tabs).toBe("function");
    expect(typeof Tooltip).toBe("function");
    expect(InfoTip).toBe(Tooltip);
    expect(typeof EmptyState).toBe("function");
    expect(typeof isPrimaryActionKey).toBe("function");
    expect(typeof Button).toBe("function");
    expect(typeof IconButton).toBe("function");
    expect(typeof Badge).toBe("function");
    expect(typeof Checkbox).toBe("function");
    expect(typeof RadioGroup).toBe("function");
    expect(typeof Accordion).toBe("function");
    expect(typeof Drawer).toBe("function");
    expect(typeof isPrimaryActionKey).toBe("function");
    expect(
      isPrimaryActionKey({
        key: "Enter",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
    expect(isDrawerOpen()).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isActivateTarget(null)).toBe(false);
    expect(listCursorDelta("j")).toBe(1);
    expect(listCursorDelta("k")).toBe(-1);
    expect(listCursorDelta("Enter")).toBe(0);
    expect(pageShortcutBlocked({ defaultPrevented: true, target: null })).toBe(
      true,
    );
    expect(pageShortcutBlocked({ defaultPrevented: false, target: null })).toBe(
      false,
    );
    expect(typeof Popover).toBe("function");
    expect(typeof DropdownMenu).toBe("function");
    expect(typeof Table).toBe("function");
    expect(typeof HoverTip).toBe("function");
    expect(typeof MetricCard).toBe("function");
    expect(typeof ListTile).toBe("function");
    expect(typeof Pip).toBe("function");
    expect(typeof ProgressBar).toBe("function");
    expect(typeof Truncate).toBe("function");
    expect(typeof DateRangePicker).toBe("function");
    expect(typeof DateTimePicker).toBe("function");
    expect(typeof ScreenSkeleton).toBe("function");
    expect(typeof PrismToastHost).toBe("function");
    expect(typeof showPrismToast).toBe("function");
  });

  it("keeps timestamp columns stacked so date and time never share a line", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "primitives.css"),
      "utf8",
    );
    expect(css).toMatch(/\.prism-table__when \{[^}]*flex-direction: column;/s);
    expect(css).toMatch(
      /\.prism-table__when-day,\s*\.prism-table__when-time \{[^}]*white-space: nowrap;/s,
    );
    expect(css).toMatch(/\.prism-table__col--timestamp \{/);
    expect(css).toMatch(/\.prism-table__col--tag \{/);
    expect(css).toMatch(/\.prism-table__col--number \{/);
  });

  it("pins metric-card info tips to the top-right corner", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "primitives.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.prism-metric-card__tip \{[^}]*position: absolute;[^}]*top: 8px;[^}]*right: 8px;/s,
    );
  });

  it("gives search a single stroke and no nested well", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "primitives.css"),
      "utf8",
    );
    expect(css).not.toMatch(/\.prism-search__well\b/);
    expect(css).toMatch(
      /\.prism-search \{[^}]*border: 1px solid var\(--prism-line\);/s,
    );
    expect(css).toMatch(/\.prism-search__input \{[^}]*appearance: none;/s);
  });

  it("themes the native scrollbar on every surface, rather than hiding it", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tokens.css"),
      "utf8",
    );
    expect(css).toMatch(/scrollbar-width:\s*thin/);
    expect(css).toMatch(/\*::-webkit-scrollbar/);
    expect(css).toMatch(/var\(--prism-brand\)/);
    expect(css).not.toMatch(/\* \{[^}]*scrollbar-width:\s*none/s);
  });

  it("stretches drawers with top/bottom instead of percentage height", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "primitives.css"),
      "utf8",
    );
    expect(css).toMatch(/\.prism-drawer \{[^}]*height: auto;/s);
    expect(css).toContain("max-height: 100dvh");
    expect(css).not.toMatch(/\.prism-drawer \{[^}]*height: 100%;/s);
  });
});
