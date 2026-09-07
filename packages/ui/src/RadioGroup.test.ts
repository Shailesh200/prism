import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  RadioGroup,
  selectedRadioHint,
  type RadioOption,
} from "./RadioGroup.js";

const options: readonly RadioOption[] = [
  {
    value: "checkout",
    label: "Current worktree",
    hint: "Edits stay uncommitted on this branch, in this folder",
  },
  {
    value: "worktree",
    label: "Isolated branch",
    hint: "New branch in a separate worktree Prism reviews later",
  },
];

describe("selectedRadioHint", () => {
  it("returns the selected option's meaning", () => {
    expect(selectedRadioHint(options, "checkout")).toBe(
      "Edits stay uncommitted on this branch, in this folder",
    );
    expect(selectedRadioHint(options, "worktree")).toBe(
      "New branch in a separate worktree Prism reviews later",
    );
  });

  it("omits blank hints", () => {
    expect(
      selectedRadioHint([{ value: "a", label: "A", hint: "  " }], "a"),
    ).toBeUndefined();
  });
});

describe("RadioGroup", () => {
  it("aligns the legend as a field label and shows the selected hint", () => {
    const html = renderToStaticMarkup(
      createElement(RadioGroup, {
        name: "placement",
        legend: "Placement",
        value: "checkout",
        onChange: () => undefined,
        options,
      }),
    );
    expect(html).toContain("prism-field prism-radios");
    expect(html).toContain(
      '<legend class="prism-field__label">Placement</legend>',
    );
    expect(html).toContain(
      "Edits stay uncommitted on this branch, in this folder",
    );
    expect(html).not.toContain(
      "New branch in a separate worktree Prism reviews later",
    );
  });
});
