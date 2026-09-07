import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobTokenIo } from "./JobTokenIo.js";

describe("JobTokenIo", () => {
  it("renders an em dash when the worker never billed tokens", () => {
    const { container } = render(<JobTokenIo usage={undefined} />);
    expect(container.textContent).toBe("—");
  });

  it("shows billed in and out as arrows", () => {
    render(
      <JobTokenIo
        usage={{
          inputTokens: 26_000,
          outputTokens: 1_900,
        }}
      />,
    );
    expect(screen.getByLabelText("In 26k, out 1.9k")).toBeTruthy();
  });
});
