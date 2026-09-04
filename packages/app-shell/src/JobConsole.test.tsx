// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobConsole } from "./JobConsole.js";
import type { JobConsoleEntry } from "./jobs-types.js";

function thinking(text: string): JobConsoleEntry {
  return {
    ts: "2026-01-01T02:06:44.000Z",
    phase: "thinking",
    text,
    level: "info",
  };
}

describe("JobConsole markdown", () => {
  it("renders bold, code, and lists instead of raw markup", () => {
    render(
      <JobConsole
        live={false}
        entries={[
          thinking(
            "Read-only audit of **Prism**. - **apps/website** — GSAP. - `lib/gsap.ts` wraps plugins.",
          ),
        ]}
      />,
    );

    expect(screen.getByText("Prism").tagName).toBe("STRONG");
    expect(screen.getByText("apps/website").tagName).toBe("STRONG");
    expect(screen.getByText("lib/gsap.ts").tagName).toBe("CODE");
    expect(screen.queryByText(/\*\*Prism\*\*/)).toBeNull();
    const mdItems = document.querySelectorAll(".md-doc__list li");
    expect(mdItems).toHaveLength(2);
    expect(mdItems[0]?.textContent).toMatch(/apps\/website/);
  });

  it("leaves a plain tool line as text", () => {
    render(
      <JobConsole
        live={false}
        entries={[
          {
            ts: "2026-01-01T00:00:01.000Z",
            phase: "tool",
            text: "Using grep",
            level: "info",
          },
        ]}
      />,
    );
    expect(screen.getByText("Using grep")).toBeTruthy();
  });
});
