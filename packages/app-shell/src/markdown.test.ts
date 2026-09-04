import { describe, expect, it } from "vitest";
import { parseMarkdown, prepareMarkdown, splitTableRow } from "./markdown.js";

describe("parseMarkdown", () => {
  it("parses a GFM pipe table", () => {
    const blocks = parseMarkdown(
      [
        "| File | GSAP APIs | Animates |",
        "|---|---|---|",
        "| `RouteLoader.tsx` | core `timeline()` | Top progress bar |",
        "| `CustomCursor.tsx` | `quickTo` | Cursor ring |",
        "",
        "After the table.",
      ].join("\n"),
    );
    expect(blocks[0]).toEqual({
      type: "table",
      headers: ["File", "GSAP APIs", "Animates"],
      rows: [
        ["`RouteLoader.tsx`", "core `timeline()`", "Top progress bar"],
        ["`CustomCursor.tsx`", "`quickTo`", "Cursor ring"],
      ],
    });
    expect(blocks[1]).toEqual({ type: "paragraph", text: "After the table." });
  });

  it("joins wrapped list items", () => {
    const blocks = parseMarkdown(
      "- `lib/gsap.ts` — imports `gsap`,\n  `ScrollTrigger` and `SplitText`.\n- next item",
    );
    expect(blocks).toEqual([
      {
        type: "list",
        items: [
          "`lib/gsap.ts` — imports `gsap`, `ScrollTrigger` and `SplitText`.",
          "next item",
        ],
      },
    ]);
  });

  it("splits jammed '- **bold**' / '- `code`' markers onto their own lines", () => {
    expect(
      prepareMarkdown(
        "Read-only audit. - **apps/website** — GSAP. - `lib/gsap.ts` wraps plugins.",
      ),
    ).toBe(
      "Read-only audit.\n- **apps/website** — GSAP.\n- `lib/gsap.ts` wraps plugins.",
    );
  });

  it("turns jammed markers into a real list", () => {
    const blocks = parseMarkdown(
      "Read-only audit. - **apps/website** — GSAP. - `lib/gsap.ts` wraps plugins.",
    );
    expect(blocks[0]).toEqual({
      type: "paragraph",
      text: "Read-only audit.",
    });
    expect(blocks[1]).toEqual({
      type: "list",
      items: ["**apps/website** — GSAP.", "`lib/gsap.ts` wraps plugins."],
    });
  });

  it("splits a table row on pipes", () => {
    expect(splitTableRow("| a | b | c |")).toEqual(["a", "b", "c"]);
  });
});
