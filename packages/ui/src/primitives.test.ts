import { describe, expect, it } from "vitest";
import {
  EmptyState,
  InfoTip,
  Input,
  PACKAGE_NAME,
  SearchableInput,
  Select,
  Tabs,
  Textarea,
  ToggleGroup,
  Tooltip,
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
    expect(typeof Select).toBe("function");
    expect(typeof SearchableInput).toBe("function");
    expect(typeof ToggleGroup).toBe("function");
    expect(typeof Tabs).toBe("function");
    expect(typeof Tooltip).toBe("function");
    expect(InfoTip).toBe(Tooltip);
    expect(typeof EmptyState).toBe("function");
  });
});
